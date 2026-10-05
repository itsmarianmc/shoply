import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, DATA_DIR } from "@/lib/db";
import { addItem, checkItem, completeShopping, deleteItem, getItemById, getPendingShoppingCount, restoreItem, uncheckItem, undoCheckItem } from "@/lib/items";
import { setCheckedItemBehavior } from "@/lib/settings";
import { deleteStoredImage, getImageStorageUsage, listStoredImages, maintainImageStorage, readStoredImage, setImageStorageQuota, uploadItemImage } from "@/lib/item-images";
import { IMAGE_QUOTA_MESSAGE, MAX_IMAGE_BYTES } from "@/lib/image-policy";

const imageDir = path.join(DATA_DIR, "item-images");
let userId: number;
let sample: Buffer;

function item(name = "Milk"): number {
  addItem(name, userId);
  return (db.prepare("SELECT id FROM items ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  db.exec("DELETE FROM items; DELETE FROM item_images; DELETE FROM shopping_sessions; DELETE FROM item_history; DELETE FROM users;");
  userId = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES ('member', 'MEMBER', 'x')").run().lastInsertRowid);
  setCheckedItemBehavior("KEEP_IN_LIST");
  setImageStorageQuota(1_000_000_000);
  maintainImageStorage();
  sample = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "red" } }).png().toBuffer();
});

describe("item images", () => {
  it("decodes actual image content, compresses it, and stores only metadata in SQLite", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    const bytes = readStoredImage(id)!;
    const meta = await sharp(bytes).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1200, height: 600 });
    expect(meta.exif).toBeUndefined();
    expect(getItemById(itemId)?.image_id).toBe(id);
    expect(getImageStorageUsage()).toMatchObject({ fileCount: 1, usedBytes: bytes.length, limitBytes: 1_000_000_000 });
    expect(listStoredImages()).toEqual([{ id, itemName: "Milk", sizeBytes: bytes.length, pendingDeletion: false }]);
  });

  it("preserves attachments through check, uncheck, and undo", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    uncheckItem(itemId);
    checkItem(itemId, userId);
    expect(undoCheckItem(itemId)).toBe(true);
    expect(getItemById(itemId)?.image_id).toBe(id);
    expect(readStoredImage(id)).not.toBeNull();
  });

  it("finishes only checked items, including auto-archived items, and blocks stale undo", async () => {
    const normal = item("Normal");
    const automatic = item("Automatic");
    const active = item("Next trip");
    const ids = await Promise.all([normal, automatic, active].map((id) => uploadItemImage(id, sample)));
    checkItem(normal, userId);
    setCheckedItemBehavior("ARCHIVE");
    checkItem(automatic, userId);
    expect(getPendingShoppingCount()).toBe(2);
    expect(readStoredImage(ids[1]!)).not.toBeNull();
    expect(completeShopping(userId)).toBe(2);
    expect(getPendingShoppingCount()).toBe(0);
    expect(readStoredImage(ids[0]!)).toBeNull();
    expect(readStoredImage(ids[1]!)).toBeNull();
    expect(readStoredImage(ids[2]!)).not.toBeNull();
    expect(undoCheckItem(automatic)).toBe(false);
    expect(completeShopping(userId)).toBe(0);
    restoreItem(normal);
    expect(getItemById(normal)?.image_id).toBeNull();
  });

  it("preserves auto-archived images during undo and unfinished archive restoration", async () => {
    setCheckedItemBehavior("ARCHIVE");
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    expect(undoCheckItem(itemId)).toBe(true);
    expect(readStoredImage(id)).not.toBeNull();
    checkItem(itemId, userId);
    restoreItem(itemId);
    expect(readStoredImage(id)).not.toBeNull();
    expect(getItemById(itemId)?.image_id).toBe(id);
    checkItem(itemId, userId);
    completeShopping(userId);
    restoreItem(itemId);
    expect(readStoredImage(id)).toBeNull();
  });

  it("timeout notifications do not prematurely complete the trip or remove images", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    setCheckedItemBehavior("ARCHIVE");
    checkItem(itemId, userId);
    db.prepare("UPDATE shopping_sessions SET last_activity_at = datetime('now', '-61 minutes')").run();
    checkItem(item("New session"), userId);
    expect(readStoredImage(id)).not.toBeNull();
    completeShopping(userId);
    expect(readStoredImage(id)).toBeNull();
  });

  it("replaces files without growing the final file count or reusing the old URL", async () => {
    const itemId = item();
    const old = await uploadItemImage(itemId, sample);
    const next = await uploadItemImage(itemId, sample);
    expect(next).not.toBe(old);
    expect(readStoredImage(old)).toBeNull();
    expect(getItemById(itemId)?.image_id).toBe(next);
    expect(getImageStorageUsage().fileCount).toBe(1);
    deleteStoredImage(next);
    expect(getImageStorageUsage().usedBytes).toBe(0);
    expect(getItemById(itemId)?.image_id).toBeNull();
  });

  it("rejects damaged, oversized, unsupported and excessively large images", async () => {
    const itemId = item();
    await expect(uploadItemImage(itemId, Buffer.from("fake JPEG"))).rejects.toThrow("invalid");
    await expect(uploadItemImage(itemId, new Uint8Array(MAX_IMAGE_BYTES + 1))).rejects.toThrow("10 MB");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    await expect(uploadItemImage(itemId, svg)).rejects.toThrow("still JPEG");
    const wide = await sharp({ create: { width: 8193, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    await expect(uploadItemImage(itemId, wide)).rejects.toThrow("8192");
    const pixels = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
    await expect(uploadItemImage(itemId, pixels)).rejects.toThrow("40 megapixel");
    await expect(uploadItemImage(itemId, sample.subarray(0, 100))).rejects.toThrow();
    expect(getImageStorageUsage().fileCount).toBe(0);
  });

  it("enforces quota against disk sizes, including failed cleanup, and keeps older images", async () => {
    const itemId = item();
    const old = await uploadItemImage(itemId, sample);
    setImageStorageQuota(100_000_000);
    const orphan = path.join(imageDir, `${randomUUID()}.webp`);
    fs.writeFileSync(orphan, "x");
    fs.truncateSync(orphan, 100_000_000);
    const unlink = vi.spyOn(fs, "unlinkSync").mockImplementation(() => { throw new Error("disk busy"); });
    await expect(uploadItemImage(itemId, sample)).rejects.toThrow(IMAGE_QUOTA_MESSAGE);
    expect(getImageStorageUsage().usedBytes).toBeGreaterThan(100_000_000);
    expect(getItemById(itemId)?.image_id).toBe(old);
    unlink.mockRestore();
    maintainImageStorage();
    expect(getImageStorageUsage().fileCount).toBe(1);
  });

  it("rejects an upload that would cross quota before it is full", async () => {
    const itemId = item();
    const encoded = await sharp(sample).resize({ width: 1200, height: 1200, fit: "inside" }).webp({ quality: 80 }).toBuffer();
    setImageStorageQuota(100_000_000);
    const orphan = path.join(imageDir, `${randomUUID()}.webp`);
    fs.writeFileSync(orphan, "x");
    fs.truncateSync(orphan, 100_000_000 - encoded.length + 1);
    vi.spyOn(fs, "unlinkSync").mockImplementation(() => { throw new Error("disk busy"); });
    await expect(uploadItemImage(itemId, sample)).rejects.toThrow(IMAGE_QUOTA_MESSAGE);
    expect(getItemById(itemId)?.image_id).toBeNull();
  });

  it("rolls back metadata and removes the new file if the database insert fails", async () => {
    const itemId = item();
    const old = await uploadItemImage(itemId, sample);
    db.exec("CREATE TRIGGER fail_image_insert BEFORE INSERT ON item_images BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try { await expect(uploadItemImage(itemId, sample)).rejects.toThrow("Could not store"); }
    finally { db.exec("DROP TRIGGER fail_image_insert;"); }
    expect(getItemById(itemId)?.image_id).toBe(old);
    expect(readStoredImage(old)).not.toBeNull();
    expect(getImageStorageUsage().fileCount).toBe(1);
  });

  it("does not delete files when the completion transaction rolls back", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    db.exec("CREATE TRIGGER fail_complete BEFORE UPDATE OF shopping_completed_at ON items BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try { expect(() => completeShopping(userId)).toThrow("test failure"); }
    finally { db.exec("DROP TRIGGER fail_complete;"); }
    expect(getPendingShoppingCount()).toBe(1);
    expect(readStoredImage(id)).not.toBeNull();
    expect(undoCheckItem(itemId)).toBe(true);
  });

  it("retries pending deletions and repairs missing metadata and interrupted uploads", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    const unlink = vi.spyOn(fs, "unlinkSync").mockImplementation(() => { throw new Error("disk busy"); });
    completeShopping(userId);
    expect(listStoredImages()[0]?.pendingDeletion).toBe(true);
    expect(getImageStorageUsage().fileCount).toBe(1);
    unlink.mockRestore();
    maintainImageStorage();
    expect(listStoredImages()).toHaveLength(0);
    restoreItem(itemId);
    const missing = await uploadItemImage(itemId, sample);
    fs.unlinkSync(path.join(imageDir, `${missing}.webp`));
    expect(readStoredImage(missing)).toBeNull();
    expect(getItemById(itemId)?.image_id).toBeNull();
    const orphan = path.join(imageDir, `${randomUUID()}.webp`);
    fs.writeFileSync(orphan, "interrupted upload");
    maintainImageStorage();
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it("queues cleanup when an attached item is deleted", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    deleteItem(itemId);
    expect(readStoredImage(id)).toBeNull();
    expect(getImageStorageUsage().fileCount).toBe(0);
  });

  it("keeps concurrent replacements consistent with one final attachment", async () => {
    const itemId = item();
    await Promise.all([uploadItemImage(itemId, sample), uploadItemImage(itemId, sample)]);
    expect(getImageStorageUsage().fileCount).toBe(1);
    const id = getItemById(itemId)?.image_id;
    expect(id).toBeTruthy();
    expect(listStoredImages()[0]?.id).toBe(id);
  });

  it("recovers when disk deletion succeeds but deleting the database record fails", async () => {
    const itemId = item();
    const id = await uploadItemImage(itemId, sample);
    db.exec("CREATE TRIGGER fail_image_delete BEFORE DELETE ON item_images BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try {
      deleteStoredImage(id);
      expect(fs.existsSync(path.join(imageDir, `${id}.webp`))).toBe(false);
      expect(db.prepare("SELECT state FROM item_images WHERE id = ?").get(id)).toEqual({ state: "DELETE" });
      expect(getItemById(itemId)?.image_id).toBeNull();
    } finally { db.exec("DROP TRIGGER fail_image_delete;"); }
    maintainImageStorage();
    expect(getImageStorageUsage().usedBytes).toBe(0);
    expect(listStoredImages()).toHaveLength(0);
  });

  it("rejects archived item uploads and traversal and validates quota bounds", async () => {
    const itemId = item();
    setCheckedItemBehavior("ARCHIVE");
    checkItem(itemId, userId);
    await expect(uploadItemImage(itemId, sample)).rejects.toThrow("current shopping list");
    expect(readStoredImage("../../shoply.db")).toBeNull();
    expect(() => deleteStoredImage("../shoply.db")).toThrow("not found");
    for (const limit of [99_999_999, 10_000_000_001, NaN, 100_000_000.5]) expect(() => setImageStorageQuota(limit)).toThrow("100 MB");
    setImageStorageQuota(10_000_000_000);
    expect(getImageStorageUsage().limitBytes).toBe(10_000_000_000);
  });

  it("rejects an in-flight upload if completion and restoration start a new trip", async () => {
    const itemId = item();
    const upload = uploadItemImage(itemId, sample);
    checkItem(itemId, userId);
    completeShopping(userId);
    restoreItem(itemId);
    await expect(upload).rejects.toThrow("current shopping list");
    expect(getImageStorageUsage().fileCount).toBe(0);
  });
});
