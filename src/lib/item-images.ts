import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { DATA_DIR, db } from "./db";
import { bumpRevision } from "./revision";
import {
  DEFAULT_IMAGE_QUOTA, MIN_IMAGE_QUOTA, MAX_IMAGE_QUOTA,
  MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, IMAGE_QUOTA_MESSAGE,
  type ImageStorageUsage, type StoredImage,
} from "./image-policy";

const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IMAGE_DIR = path.join(DATA_DIR, "item-images");
const FORMATS = new Set(["jpeg", "png", "webp"]);

export class ImageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

interface ImageRecord {
  id: string;
  item_id: number | null;
  item_name: string;
  size_bytes: number;
  state: "READY" | "DELETE";
}

export function isImageId(id: string): boolean { return IMAGE_ID.test(id); }

function imagePath(id: string): string {
  if (!isImageId(id)) throw new ImageError("Image not found.", 404);
  return path.join(IMAGE_DIR, `${id}.webp`);
}

function getQuota(): number {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'image_storage_limit_bytes'").get() as { value: string } | undefined;
  const value = Number(row?.value);
  return Number.isSafeInteger(value) && value >= MIN_IMAGE_QUOTA && value <= MAX_IMAGE_QUOTA ? value : DEFAULT_IMAGE_QUOTA;
}

function diskFiles(): Map<string, number> {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const files = new Map<string, number>();
  for (const name of fs.readdirSync(IMAGE_DIR)) {
    const stat = fs.lstatSync(path.join(IMAGE_DIR, name));
    if (stat.isFile()) files.set(name, stat.size);
  }
  return files;
}

function removeFile(id: string): boolean {
  try { fs.unlinkSync(imagePath(id)); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    console.error("Item image cleanup will be retried", { imageId: id });
    return false;
  }
}

// Always called under a SQLite write lock, shared by all app workers. No async
// disk writes can race this scan. Interrupted uploads leave generated files
// without committed metadata; interrupted deletes leave a durable DELETE row.
function reconcile(): Map<string, number> {
  db.prepare("UPDATE item_images SET state = 'DELETE' WHERE item_id IS NULL AND state = 'READY'").run();
  const files = diskFiles();
  const rows = db.prepare("SELECT * FROM item_images").all() as ImageRecord[];
  let changed = false;
  const known = new Set(rows.map((row) => `${row.id}.webp`));
  for (const row of rows) {
    if (!isImageId(row.id)) {
      db.prepare("DELETE FROM item_images WHERE id = ?").run(row.id);
      changed = true;
      continue;
    }
    const name = `${row.id}.webp`;
    if (row.state === "DELETE") {
      if (removeFile(row.id)) {
        files.delete(name);
        db.prepare("DELETE FROM item_images WHERE id = ?").run(row.id);
        changed = true;
      } else if (files.has(name) && files.get(name) !== row.size_bytes) {
        db.prepare("UPDATE item_images SET size_bytes = ? WHERE id = ?").run(files.get(name), row.id);
        changed = true;
      }
    } else if (!files.has(name)) {
      // lstat excludes symlinks/directories; never serve their target content.
      removeFile(row.id);
      files.delete(name);
      db.prepare("DELETE FROM item_images WHERE id = ?").run(row.id);
      changed = true;
    } else if (files.get(name) === 0) {
      if (removeFile(row.id)) {
        files.delete(name);
        db.prepare("DELETE FROM item_images WHERE id = ?").run(row.id);
      } else {
        db.prepare("UPDATE item_images SET state = 'DELETE', size_bytes = 0 WHERE id = ?").run(row.id);
      }
      changed = true;
    } else if (files.get(name) !== row.size_bytes) {
      db.prepare("UPDATE item_images SET size_bytes = ? WHERE id = ?").run(files.get(name), row.id);
      changed = true;
    }
  }
  for (const name of files.keys()) {
    const id = name.endsWith(".webp") ? name.slice(0, -5) : "";
    if (isImageId(id) && !known.has(name)) {
      if (removeFile(id)) files.delete(name);
      else {
        // Surface interrupted uploads whose disk deletion failed to admins.
        db.prepare("INSERT OR IGNORE INTO item_images (id, item_name, size_bytes, state) VALUES (?, 'Unassociated image', ?, 'DELETE')").run(id, files.get(name));
        changed = true;
      }
    }
  }
  if (changed) bumpRevision();
  return files;
}

function withStorageLock<T>(operation: () => T): T {
  return db.transaction(() => {
    // db.ts wraps transactions, so explicitly take the write lock before any
    // filesystem inspection or mutation (also works with an in-memory test DB).
    db.prepare("UPDATE app_settings SET value = value WHERE key = 'image_storage_limit_bytes'").run();
    return operation();
  })();
}

export function maintainImageStorage(): void {
  try { withStorageLock(() => { reconcile(); }); }
  catch { console.error("Item image maintenance will be retried"); }
}

export function getImageStorageUsage(): ImageStorageUsage {
  return withStorageLock(() => {
    const files = reconcile();
    return { usedBytes: [...files.values()].reduce((total, size) => total + size, 0), limitBytes: getQuota(), fileCount: files.size };
  });
}

export function listStoredImages(): StoredImage[] {
  return withStorageLock(() => {
    reconcile();
    return (db.prepare("SELECT * FROM item_images ORDER BY created_at DESC, id").all() as ImageRecord[]).map((row) => ({
      id: row.id, itemName: row.item_name, sizeBytes: row.size_bytes, pendingDeletion: row.state === "DELETE",
    }));
  });
}

export function setImageStorageQuota(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < MIN_IMAGE_QUOTA || bytes > MAX_IMAGE_QUOTA) {
    throw new ImageError("Choose a storage limit between 100 MB and 10 GB.");
  }
  withStorageLock(() => {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('image_storage_limit_bytes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(bytes));
    bumpRevision();
  });
}

// Queue within the SAME transaction as completion or item deletion.
// Physical deletion happens only after that transaction has committed.
export function queueItemImageDeletion(itemId: number): void {
  db.prepare("UPDATE item_images SET state = 'DELETE' WHERE item_id = ? AND state = 'READY'").run(itemId);
}

export function deleteStoredImage(id: string): void {
  if (!isImageId(id)) throw new ImageError("Image not found.", 404);
  withStorageLock(() => {
    const result = db.prepare("UPDATE item_images SET state = 'DELETE' WHERE id = ?").run(id);
    if (result.changes) bumpRevision();
  });
  maintainImageStorage();
}

export async function uploadItemImage(itemId: number, bytes: Uint8Array): Promise<string> {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ImageError("Choose an image of 10 MB or smaller.", 413);
  const initial = db.prepare("SELECT image_generation FROM items WHERE id = ? AND archived = 0 AND shopping_completed_at IS NULL").get(itemId) as { image_generation: number } | undefined;
  if (!initial) throw new ImageError("This item is no longer in the current shopping list.", 409);
  let output: Buffer;
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const meta = await image.metadata();
    if (!meta.format || !FORMATS.has(meta.format) || !meta.width || !meta.height || (meta.pages ?? 1) !== 1) {
      throw new ImageError("Choose a still JPEG, PNG, or WebP image.");
    }
    if (meta.width > MAX_IMAGE_DIMENSION || meta.height > MAX_IMAGE_DIMENSION) {
      throw new ImageError("Image dimensions must not exceed 8192 pixels or 40 megapixels.");
    }
    // Full decode verifies pixels. Re-encoding strips EXIF/location metadata.
    output = await image.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("The image is invalid, damaged, or exceeds the 40 megapixel limit.");
  }

  const id = randomUUID();
  let wroteFile = false;
  try {
    withStorageLock(() => {
      const files = reconcile();
      const item = db.prepare("SELECT name FROM items WHERE id = ? AND archived = 0 AND shopping_completed_at IS NULL AND image_generation = ?").get(itemId, initial.image_generation) as { name: string } | undefined;
      if (!item) throw new ImageError("This item is no longer in the current shopping list.", 409);
      const used = [...files.values()].reduce((sum, size) => sum + size, 0);
      // Include the old file until deletion succeeds, even during replacement.
      if (used >= getQuota() || used + output.length > getQuota()) throw new ImageError(IMAGE_QUOTA_MESSAGE, 413);
      const descriptor = fs.openSync(imagePath(id), "wx", 0o600);
      wroteFile = true;
      try { fs.writeFileSync(descriptor, output); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      queueItemImageDeletion(itemId);
      db.prepare("INSERT INTO item_images (id, item_id, item_name, size_bytes) VALUES (?, ?, ?, ?)").run(id, itemId, item.name, output.length);
      bumpRevision();
    });
  } catch (error) {
    if (wroteFile) removeFile(id);
    if (error instanceof ImageError) throw error;
    throw new ImageError("Could not store the image. Please try again.", 500);
  }
  // A cleanup failure must not turn a successfully committed upload into an error.
  maintainImageStorage();
  return id;
}

export function readStoredImage(id: string, includePending = false): Buffer | null {
  if (!isImageId(id)) return null;
  return withStorageLock(() => {
    reconcile();
    const row = db.prepare("SELECT id FROM item_images WHERE id = ? AND (state = 'READY' OR ?)").get(id, includePending ? 1 : 0);
    if (!row) return null;
    try { return fs.readFileSync(imagePath(id)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  });
}
