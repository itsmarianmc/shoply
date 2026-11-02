import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getSnapshot } from "@/lib/offline/server";
import { freshAccount } from "@/lib/offline/model";
import { changeAccount, LOCAL_IMAGE_LIMIT, pruneImages, readAccount, readImage, removeAccount, storeImage } from "@/lib/offline/storage";
import { privateImage } from "@/lib/offline/images";

function fixture() {
  const userId = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, 'MEMBER', 'x')").run(crypto.randomUUID()).lastInsertRowid);
  db.prepare("INSERT INTO categories (name, is_default) SELECT 'Uncategorized', 1 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE is_default = 1)").run();
  db.prepare("INSERT INTO items (name, category_id, added_by_user_id) VALUES ('Photo', (SELECT id FROM categories WHERE is_default = 1 LIMIT 1), ?)").run(userId);
  const account = freshAccount(getSnapshot({ id: userId, name: "Photos", role: "MEMBER" }));
  account.snapshot.items[0]!.image_id = "photo";
  return account;
}

it("upgrades a v1 database without changing its saved shopping data", async () => {
  const saved = fixture();
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("shoply-private-offline", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("accounts");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>(resolve => { const tx = database.transaction("accounts", "readwrite"); tx.objectStore("accounts").put(saved, "upgrade"); tx.oncomplete = () => resolve(); });
  database.close();
  expect(await readAccount("upgrade")).toEqual(saved);
  await storeImage("upgrade", "photo", new Blob(["private"], { type: "image/webp" }));
  expect((await readImage("upgrade", "photo"))?.size).toBe(7);
});

it("isolates photo blobs, denies locked accounts, and removes them on logout/reset", async () => {
  await changeAccount("a", () => fixture()); await changeAccount("b", () => fixture());
  const blob = new Blob(["private"], { type: "image/webp" });
  await storeImage("a", "photo", blob);
  expect((await readImage("a", "photo"))?.size).toBe(blob.size);
  expect(await readImage("b", "photo")).toBeUndefined();
  await changeAccount("a", current => { current!.locked = true; return current; });
  expect(await readImage("a", "photo")).toBeUndefined();
  await changeAccount("a", current => { current!.locked = false; return current; });
  expect((await readImage("a", "photo"))?.size).toBe(blob.size);
  await storeImage("b", "photo", blob); await removeAccount("a"); await changeAccount("a", () => fixture());
  expect(await readImage("a", "photo")).toBeUndefined();
  expect((await readImage("b", "photo"))?.size).toBe(blob.size);
});

it("rejects stale photos after replacement and prunes only that account", async () => {
  await changeAccount("a", () => fixture()); await storeImage("a", "photo", new Blob(["old"]));
  await changeAccount("a", current => { current!.snapshot.items[0]!.image_id = "new"; return current; });
  expect(await readImage("a", "photo")).toBeUndefined();
  await storeImage("a", "photo", new Blob(["late response"]));
  await pruneImages("a");
  await changeAccount("a", current => { current!.snapshot.items[0]!.image_id = "photo"; return current; });
  expect(await readImage("a", "photo")).toBeUndefined();
});

it("bounds optional caching and preserves shopping data on quota failure", async () => {
  await changeAccount("a", () => fixture()); const before = await readAccount("a");
  await expect(storeImage("a", "photo", new Blob([new Uint8Array(LOCAL_IMAGE_LIMIT + 1)]))).rejects.toThrow("50 MB");
  const opened = indexedDB.open("shoply-private-offline", 2);
  const database = await new Promise<IDBDatabase>(resolve => { opened.onsuccess = () => resolve(opened.result); });
  const proto = Object.getPrototypeOf(database.transaction("images").objectStore("images"));
  const put = vi.spyOn(proto, "put").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await expect(storeImage("a", "photo", new Blob(["test"]))).rejects.toMatchObject({ name: "QuotaExceededError" });
  put.mockRestore(); database.close(); expect(await readAccount("a")).toEqual(before);
});

it("never persists an image response authenticated under a different account", async () => {
  await removeAccount("a"); await changeAccount("a", () => fixture());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret", { headers: { "content-type": "image/webp", "x-shoply-account": "b" } })));
  try {
    expect(await privateImage("a", "photo", () => true, true)).toBeUndefined();
    expect(await readImage("a", "photo")).toBeUndefined();
  } finally { vi.unstubAllGlobals(); }
});
