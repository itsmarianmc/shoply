import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { accountKeyFor } from "@/lib/offline/account";
import { applyOperation, getSnapshot, syncItem } from "@/lib/offline/server";
import { addItem, checkItem, completeShopping, deleteItem, restoreItem, uncheckItem, updateItem } from "@/lib/items";
import { moveItemToCategory } from "@/lib/categories";
import { setCheckedItemBehavior } from "@/lib/settings";
import { appendOperation, freshAccount, visibleItems } from "@/lib/offline/model";
import type { Operation, SyncItem } from "@/lib/offline/types";
import type { PublicUser } from "@/lib/types";

let admin: PublicUser;
let member: PublicUser;
let account: string;
let original: SyncItem;
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
function op(kind: Operation["kind"], base: SyncItem = original, extra: Partial<Operation> = {}): Operation {
  return { id: randomUUID(), kind, target: base.key, base, delayed: true, ...extra };
}
const send = (operation: Operation, user = admin) => applyOperation(user, accountKeyFor(user.id), operation).receipt;

beforeEach(() => {
  db.exec("DELETE FROM items; DELETE FROM item_images; DELETE FROM item_history; DELETE FROM shopping_sessions; DELETE FROM sync_receipts; DELETE FROM sync_item_links; DELETE FROM users; DELETE FROM categories;");
  const user = (name: string, role: PublicUser["role"]): PublicUser => ({ id: Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, ?, 'x')").run(name, role).lastInsertRowid), name, role });
  admin = user("Admin", "ADMIN"); member = user("Member", "MEMBER"); account = accountKeyFor(admin.id);
  setCheckedItemBehavior("KEEP_IN_LIST");
  original = syncItem(addItem("Milk", admin.id, { quantity: 2, unit: "l" }))!;
});

describe("durable server operations", () => {
  it("replays a lost add/quantity-merge response without increasing quantity twice", () => {
    const add: Operation = { id: randomUUID(), kind: "add", target: `c:${randomUUID()}`, base: null, fields: { name: "Milk", quantity: 3, unit: "l", note: null }, categoryId: original.category_id, duplicate: original, delayed: true };
    expect(send(add)).toMatchObject({ outcome: "applied", item: { quantity: 5 } });
    expect(applyOperation(admin, account, add).replay).toBe(true);
    expect(syncItem(original.id)?.quantity).toBe(5);
    expect(count("items")).toBe(1);
    expect(count("sync_receipts")).toBe(1);
  });
  it("does not silently merge unseen or incompatible additions", () => {
    const add: Operation = { id: randomUUID(), kind: "add", target: `c:${randomUUID()}`, base: null, fields: { name: "Milk", quantity: 1, unit: "l", note: null }, categoryId: original.category_id, delayed: true };
    expect(send(add).outcome).toBe("applied");
    expect(count("items")).toBe(2);
    expect(syncItem(original.id)?.quantity).toBe(2);
  });
  it("blocks an intended merge if the duplicate changed, and can durably adopt shared identity", () => {
    const add: Operation = { id: randomUUID(), kind: "add", target: `c:${randomUUID()}`, base: null, fields: { name: "Milk", quantity: 1, unit: "l", note: null }, categoryId: original.category_id, duplicate: original, delayed: true };
    updateItem(original.id, { quantity: 6, unit: "l" });
    expect(send(add).outcome).toBe("conflict");
    const accept = op("accept", syncItem(original.id)!, { target: add.target, adoptId: original.id });
    expect(send(accept).outcome).toBe("applied");
    expect(send(op("edit", original, { target: add.target, baseFrom: accept.id, patch: { note: "shared identity" } })).outcome).toBe("applied");
  });
  it.each(["KEEP_IN_LIST", "ARCHIVE"] as const)("preserves identity/order through offline add/check/edit/undo/delete in %s", behavior => {
    setCheckedItemBehavior(behavior);
    const local = freshAccount(getSnapshot(admin));
    const ref = `c:${randomUUID()}`;
    local.localIds[ref] = local.nextId--;
    const add: Operation = { id: randomUUID(), kind: "add", target: ref, base: null, fields: { name: "Offline", quantity: 1, unit: null, note: null }, categoryId: original.category_id, delayed: true };
    local.queue.push(add);
    let projected = visibleItems(local).find(i => i.key === ref)!;
    const check = appendOperation(local, "check", projected);
    projected = visibleItems(local).find(i => i.key === ref)!;
    const edit = appendOperation(local, "edit", projected, { patch: { note: "remember" } });
    projected = visibleItems(local).find(i => i.key === ref)!;
    const undo = appendOperation(local, "undo", projected);
    const results = [add, check, edit, undo].map(operation => send(operation));
    expect(results.every(result => result.outcome === "applied")).toBe(true);
    const final = syncItem(results[0]!.serverId!)!;
    expect(final).toMatchObject({ status: "ACTIVE", archived: 0, note: "remember" });
    expect(send(op("check", final, { target: ref })).outcome).toBe("applied");
    expect(send(op("delete", syncItem(final.id)!, { target: ref })).outcome).toBe("applied");
    expect(syncItem(final.id)).toBeNull();
  });
  it("retries check with exactly one history/session/notification intent and preserves another checker", () => {
    const first = op("check", original, { delayed: false });
    const result = applyOperation(admin, account, first, true);
    expect(result.receipt.notificationSessionId).toBeDefined();
    expect(applyOperation(admin, account, first, true).replay).toBe(true);
    expect(send(op("check"), member).outcome).toBe("applied");
    expect(syncItem(original.id)?.checked_by_user_id).toBe(admin.id);
    expect(db.prepare("SELECT use_count FROM item_history").get()).toEqual({ use_count: 1 });
    expect(count("shopping_sessions")).toBe(1);
  });
  it("suppresses delayed pushes while recording the shopping session", () => {
    expect(send(op("check")).notificationSessionId).toBeUndefined();
    expect(count("shopping_sessions")).toBe(1);
    expect(count("item_history")).toBe(1);
  });
  it("rolls back mutation, history and shopping session if receipt persistence fails", () => {
    db.exec("CREATE TEMP TRIGGER receipt_failure BEFORE INSERT ON sync_receipts BEGIN SELECT RAISE(ABORT, 'receipt disk full'); END;");
    try { expect(() => send(op("check"))).toThrow("receipt disk full"); }
    finally { db.exec("DROP TRIGGER receipt_failure"); }
    expect(syncItem(original.id)?.status).toBe("ACTIVE");
    expect(count("item_history")).toBe(0); expect(count("shopping_sessions")).toBe(0);
  });
  it("rejects operation ID reuse and cross-account dependency replay", () => {
    const check = op("check"); send(check);
    expect(() => send({ ...check, kind: "delete" })).toThrow("cannot be reused");
    expect(send(op("undo", syncItem(original.id)!, { baseFrom: check.id }), member).outcome).toBe("blocked");
    expect(() => applyOperation(member, account, op("edit", original, { patch: { note: "x" } }))).toThrow("Account changed");
  });
});

describe("field and lifecycle conflicts", () => {
  it("merges independent fields and preserves both same-field alternatives", () => {
    updateItem(original.id, { quantity: 4, unit: "l", note: null });
    expect(send(op("edit", original, { patch: { note: "local note" } })).outcome).toBe("applied");
    expect(syncItem(original.id)).toMatchObject({ quantity: 4, note: "local note" });
    const conflict = op("edit", original, { patch: { quantity: 9 } });
    expect(send(conflict)).toMatchObject({ outcome: "conflict", item: { quantity: 4 } });
    expect(send(conflict).outcome).toBe("conflict");
    expect(conflict.patch?.quantity).toBe(9);
  });
  it("detects field ABA and rechecks a resolution against further changes", () => {
    updateItem(original.id, { quantity: 5, unit: "l" }); updateItem(original.id, { quantity: 2, unit: "l" });
    expect(send(op("edit", original, { patch: { quantity: 8 } })).outcome).toBe("conflict");
    const resolution = op("edit", syncItem(original.id)!, { patch: { quantity: 8 } });
    updateItem(original.id, { quantity: 10, unit: "l" });
    expect(send(resolution).outcome).toBe("conflict");
  });
  it("allows equal effective edits without overwriting independent values", () => {
    updateItem(original.id, { quantity: 5, unit: "l", note: "remote" });
    expect(send(op("edit", original, { patch: { quantity: 5 } })).outcome).toBe("applied");
    expect(syncItem(original.id)?.note).toBe("remote");
  });
  it.each(["delete", "complete", "archive"])("retains edit/uncheck intent after remote %s", action => {
    checkItem(original.id, member.id);
    const checked = syncItem(original.id)!;
    if (action === "delete") deleteItem(original.id);
    else if (action === "complete") completeShopping();
    else db.prepare("UPDATE items SET archived = 1 WHERE id = ?").run(original.id);
    expect(send(op("edit", checked, { patch: { note: "local intent" } })).outcome).toBe("conflict");
    expect(send(op("undo", checked)).outcome).toBe("conflict");
    if (action === "delete") expect(syncItem(original.id)).toBeNull();
  });
  it("does not treat a different check cycle as the original check", () => {
    checkItem(original.id, member.id); uncheckItem(original.id); checkItem(original.id, member.id);
    expect(send(op("check")).outcome).toBe("conflict");
  });
  it("merges category and note independently, but detects conflicting category changes", () => {
    const a = Number(db.prepare("INSERT INTO categories (name) VALUES ('A')").run().lastInsertRowid);
    const b = Number(db.prepare("INSERT INTO categories (name) VALUES ('B')").run().lastInsertRowid);
    moveItemToCategory(original.id, a);
    expect(send(op("edit", original, { patch: { note: "note" } })).outcome).toBe("applied");
    expect(send(op("edit", original, { patch: { category_id: b } })).outcome).toBe("conflict");
  });
  it("validates current role/ownership and retains rejected work after a downgrade", () => {
    db.prepare("UPDATE users SET role = 'MEMBER' WHERE id = ?").run(admin.id);
    const cat = Number(db.prepare("INSERT INTO categories (name) VALUES ('Admin only')").run().lastInsertRowid);
    expect(send(op("edit", original, { patch: { category_id: cat } })).outcome).toBe("blocked");
    expect(send(op("edit", original, { patch: { name: "cannot rename" } }), member).outcome).toBe("blocked");
    expect(send(op("delete")).outcome).toBe("blocked");
    expect(count("sync_receipts")).toBe(3);
  });
  it("restores once and rejects stale restoration after a later trip", () => {
    checkItem(original.id, admin.id); completeShopping(); const archived = syncItem(original.id)!;
    const restore = op("restore", archived); expect(send(restore).outcome).toBe("applied");
    expect(send(op("restore", archived), member).outcome).toBe("applied");
    checkItem(original.id, admin.id); completeShopping();
    expect(send(op("restore", archived)).outcome).toBe("conflict");
  });
  it("recognizes two deletions of the identical checked item without repeating side effects", () => {
    checkItem(original.id, admin.id); const checked = syncItem(original.id)!;
    expect(send(op("delete", checked)).outcome).toBe("applied");
    expect(send(op("delete", checked), member).outcome).toBe("applied");
    expect(syncItem(original.id)).toBeNull();
  });
});

describe("scoped shopping completion", () => {
  it.each(["KEEP_IN_LIST", "ARCHIVE"] as const)("completes only captured identities, once, under %s", behavior => {
    setCheckedItemBehavior(behavior);
    checkItem(original.id, admin.id); const captured = syncItem(original.id)!;
    const later = addItem("Checked later", member.id); checkItem(later, member.id);
    const active = addItem("Added later", member.id);
    const complete = op("complete", captured, { trip: randomUUID() });
    expect(send(complete).outcome).toBe("applied"); expect(send(complete).outcome).toBe("applied");
    expect(syncItem(original.id)?.shopping_completed_at).toBeTruthy();
    expect(syncItem(later)?.shopping_completed_at).toBeNull(); expect(syncItem(active)?.status).toBe("ACTIVE");
    expect(db.prepare("SELECT ended_at FROM shopping_sessions").get()).toEqual({ ended_at: null });
  });
  it("does not clean an image for a conflicting completion; partial success remains durable", () => {
    checkItem(original.id, admin.id); const captured = syncItem(original.id)!;
    const id = addItem("Changed", admin.id); checkItem(id, admin.id); const changed = syncItem(id)!;
    db.prepare("INSERT INTO item_images (id, item_id, item_name, size_bytes) VALUES ('image', ?, 'Changed', 10)").run(id);
    updateItem(id, { note: "remote change" });
    expect(send(op("complete", captured)).outcome).toBe("applied");
    expect(send(op("complete", changed)).outcome).toBe("conflict");
    expect(syncItem(original.id)?.shopping_completed_at).toBeTruthy();
    expect(syncItem(id)?.shopping_completed_at).toBeNull();
    expect(db.prepare("SELECT state FROM item_images WHERE id = 'image'").get()).toEqual({ state: "READY" });
  });
  it("recognizes the same check completed elsewhere without duplicating cleanup", () => {
    checkItem(original.id, admin.id); const base = syncItem(original.id)!;
    completeShopping(); const after = syncItem(original.id)!;
    expect(send(op("complete", base)).outcome).toBe("applied");
    expect(syncItem(original.id)?.versions).toEqual(after.versions);
    restoreItem(original.id); checkItem(original.id, member.id); completeShopping();
    expect(send(op("complete", base)).outcome).toBe("conflict");
  });
  it("queues completion over the projected local snapshot, including auto-archived checks", () => {
    setCheckedItemBehavior("ARCHIVE");
    const local = freshAccount(getSnapshot(admin));
    appendOperation(local, "check", original);
    const checked = visibleItems(local).filter(i => i.status === "CHECKED" && !i.shopping_completed_at);
    expect(checked).toHaveLength(1); expect(checked[0]?.archived).toBe(1);
    appendOperation(local, "complete", checked[0]!);
    for (const queued of local.queue) expect(send(queued).outcome).toBe("applied");
    expect(syncItem(original.id)?.shopping_completed_at).toBeTruthy();
  });
});
