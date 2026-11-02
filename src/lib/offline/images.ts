"use client";

import { MAX_IMAGE_BYTES } from "../image-policy";
import { pruneImages, readImage, storeImage } from "./storage";
import type { Snapshot } from "./types";

const downloads = new Map<string, Promise<Blob | undefined>>();
const warming = new Set<string>();

export async function privateImage(key: string, id: string, current: () => boolean, online: boolean): Promise<Blob | undefined> {
  if (!current()) return;
  const saved = await readImage(key, id);
  if (!current()) return;
  if (saved || !online) return saved;
  const identity = `${key}:${id}`;
  const existing = downloads.get(identity);
  if (existing) return existing;
  const download = (async () => {
    const response = await fetch(`/api/item-images/${encodeURIComponent(id)}`, {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return;
    // An account switch can happen while a request is in flight. The server's
    // authenticated selector must match; a client cookie alone is not proof.
    if (response.headers.get("x-shoply-account") !== key || !current()) return;
    if (response.headers.get("content-type") !== "image/webp" || Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) return;
    const blob = await response.blob();
    if (!current() || blob.size > MAX_IMAGE_BYTES) return;
    const storage = await navigator.storage?.estimate?.().catch(() => undefined);
    if (storage?.quota && (storage.usage ?? 0) + blob.size > storage.quota * 0.85) throw new Error("Device storage is too low to cache more photos.");
    await storeImage(key, id, blob);
    if (!current()) return;
    window.dispatchEvent(new Event("shoply-photos"));
    return blob;
  })();
  downloads.set(identity, download);
  try { return await download; } finally { downloads.delete(identity); }
}

export async function cachePhotos(snapshot: Snapshot, current: () => boolean): Promise<void> {
  if (warming.has(snapshot.accountKey)) return;
  warming.add(snapshot.accountKey);
  try {
    await pruneImages(snapshot.accountKey);
    const ids = [...new Set([...snapshot.items].sort((a, b) => a.archived - b.archived).flatMap(item => item.image_id ? [item.image_id] : []))];
    for (const id of ids) {
      if (!current()) break;
      await privateImage(snapshot.accountKey, id, current, true);
    }
  } finally { warming.delete(snapshot.accountKey); }
}
