import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeAccount, lease, rawAccount, readAccount, removeAccount } from "@/lib/offline/storage";
import { freshAccount } from "@/lib/offline/model";
import { getSnapshot } from "@/lib/offline/server";
import { db } from "@/lib/db";

beforeEach(async () => { await removeAccount("a"); await removeAccount("b"); });
function fixture() {
  const id = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, 'MEMBER', 'x')").run(crypto.randomUUID()).lastInsertRowid);
  return freshAccount(getSnapshot({ id, name: "Member", role: "MEMBER" }));
}

describe("account-bound IndexedDB", () => {
  it("commits a snapshot and queue atomically and reads it after reopening", async () => {
    const account = fixture();
    await changeAccount("a", () => account);
    await changeAccount("a", current => {
      current!.nextId--;
      current!.queue.push({ id: crypto.randomUUID(), kind: "accept", target: "s:1", base: null, delayed: true });
      return current;
    });
    const recovered = await readAccount("a");
    expect(recovered?.queue).toHaveLength(1); expect(recovered?.nextId).toBe(-2);
    expect(await readAccount("b")).toBeUndefined();
  });
  it("aborts all writes when mutation/validation fails, retaining the old snapshot and queue", async () => {
    const account = fixture(); await changeAccount("a", () => account);
    await expect(changeAccount("a", current => { current!.nextId = -999; throw new Error("failed"); })).rejects.toThrow("failed");
    expect(await readAccount("a")).toEqual({ ...account, localRevision: 1 });
  });
  it("serializes concurrent tab appends instead of losing one", async () => {
    await changeAccount("a", () => fixture());
    await Promise.all(Array.from({ length: 20 }, () => changeAccount("a", current => {
      current!.queue.push({ id: crypto.randomUUID(), kind: "accept", target: "s:1", base: null, delayed: true }); return current;
    })));
    expect((await readAccount("a"))?.queue).toHaveLength(20);
    expect((await readAccount("a"))?.localRevision).toBe(21);
  });
  it("reports full/unavailable storage without acknowledging a save", async () => {
    await changeAccount("a", () => fixture()); const before = await readAccount("a");
    const prototype = Object.getPrototypeOf((await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("shoply-private-offline", 2); request.onsuccess = () => resolve(request.result);
    })).transaction("accounts", "readwrite").objectStore("accounts"));
    const put = vi.spyOn(prototype, "put").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    await expect(changeAccount("a", current => { current!.nextId--; return current; })).rejects.toMatchObject({ name: "QuotaExceededError" });
    put.mockRestore(); expect(await readAccount("a")).toEqual(before);
  });
  it("preserves unsupported/corrupt data for explicit recovery instead of resetting it", async () => {
    const request = indexedDB.open("shoply-private-offline", 2);
    const database = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => {
      const tx = database.transaction("accounts", "readwrite"); tx.objectStore("accounts").put({ schema: 999, pending: "retain" }, "a"); tx.oncomplete = () => resolve();
    });
    await expect(readAccount("a")).rejects.toThrow("retained");
    await expect(changeAccount("a", () => fixture())).rejects.toThrow("retained");
    expect(await rawAccount("a")).toEqual({ schema: 999, pending: "retain" }); database.close();
  });
  it("allows only one unexpired fallback lease holder and supports explicit release", async () => {
    expect(await lease("a", "tab1")).toBe(true);
    expect(await lease("a", "tab2")).toBe(false);
    expect(await lease("a", "tab1", true)).toBe(true);
    expect(await lease("a", "tab2")).toBe(true); await lease("a", "tab2", true);
  });
});
