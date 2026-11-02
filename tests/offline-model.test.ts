import { expect, it } from "vitest";
import { db } from "@/lib/db";
import { addItem } from "@/lib/items";
import { getSnapshot, syncItem } from "@/lib/offline/server";
import { appendOperation, freshAccount, visibleItems } from "@/lib/offline/model";

it("keeps one stable UI identity after repeated merges and operations using older aliases", () => {
  const id = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES ('Alias admin', 'ADMIN', 'x')").run().lastInsertRowid);
  const itemId = addItem("Repeated", id, { quantity: 2 });
  const local = freshAccount(getSnapshot({ id, name: "Alias admin", role: "ADMIN" }));
  const first = `c:${crypto.randomUUID()}`; const second = `c:${crypto.randomUUID()}`;
  local.links[first] = itemId; local.localIds[first] = -1;
  const baseline = visibleItems(local)[0]!;
  local.links[second] = itemId; local.localIds[second] = -1;
  appendOperation(local, "edit", baseline, { patch: { note: "old alias edit" } });
  const projected = visibleItems(local);
  expect(projected).toHaveLength(1); expect(projected[0]).toMatchObject({ id: -1, key: second, note: "old alias edit" });
  expect(syncItem(itemId)?.quantity).toBe(2);
});
