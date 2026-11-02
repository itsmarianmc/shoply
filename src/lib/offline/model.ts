import { EDIT_FIELDS, type LocalAccount, type Operation, type Snapshot, type SyncItem } from "./types";
import { newId } from "./id";

export function freshAccount(snapshot: Snapshot): LocalAccount {
  return { schema: 1, snapshot, queue: [], links: {}, localIds: {}, nextId: -1, locked: false, localRevision: 0 };
}

export function visibleItems(account: LocalAccount): SyncItem[] {
  const items = new Map<string, SyncItem>();
  for (const original of account.snapshot.items) {
    const alias = Object.keys(account.links).findLast(key => account.links[key] === original.id);
    const item = alias ? { ...original, key: alias, id: account.localIds[alias]! } : original;
    items.set(item.key, item);
  }
  for (const op of account.queue) {
    if (op.kind === "accept") continue;
    if (op.kind === "add") {
      const category = account.snapshot.categories.find(c => c.id === op.categoryId);
      if (!category) continue;
      const duplicate = op.duplicate;
      if (duplicate) items.delete(duplicate.key);
      items.set(op.target, {
        ...op.fields!, id: account.localIds[op.target]!, key: op.target, category_id: category.id,
        quantity: duplicate && duplicate.quantity !== null && op.fields!.quantity !== null ? duplicate.quantity + op.fields!.quantity : op.fields!.quantity,
        added_by_user_id: account.snapshot.user.id, added_by_name: account.snapshot.user.name,
        status: "ACTIVE", checked_by_user_id: null, checked_by_name: null, checked_at: null,
        archived: 0, archived_at: null, shopping_completed_at: null, sort_order: 0, created_at: "", image_id: duplicate?.image_id,
        versions: { name: 1, quantity: 1, unit: 1, note: 1, category_id: 1, lifecycle: 1, version: 1 }, pendingFrom: op.id,
      });
      continue;
    }
    const linked = account.links[op.target];
    const item = items.get(op.target) ?? (linked ? [...items.values()].find(i => (account.links[i.key] ?? i.id) === linked) : undefined) ?? (op.base ? { ...op.base } : null);
    if (!item) continue;
    if (op.kind === "delete") { items.delete(item.key); continue; }
    const next: SyncItem = { ...item, versions: { ...item.versions } };
    if (op.kind === "edit") {
      Object.assign(next, op.patch);
      for (const field of EDIT_FIELDS) if (field in op.patch! && next[field] !== item[field]) next.versions[field]++;
    } else if (op.kind === "check") {
      next.status = "CHECKED"; next.checked_by_user_id = account.snapshot.user.id;
      next.checked_by_name = account.snapshot.user.name; next.checked_at = `pending:${op.id}`;
      next.archived = account.snapshot.behavior === "ARCHIVE" ? 1 : 0;
      next.versions.lifecycle++;
    } else if (["uncheck", "undo", "restore"].includes(op.kind)) {
      next.status = "ACTIVE"; next.checked_by_user_id = null; next.checked_by_name = null; next.checked_at = null;
      next.archived = 0; next.archived_at = null; next.shopping_completed_at = null; next.versions.lifecycle++;
    } else if (op.kind === "complete") {
      next.archived = 1; next.shopping_completed_at = `pending:${op.id}`; next.image_id = null; next.versions.lifecycle++;
    }
    next.versions.version++;
    next.pendingFrom = op.id;
    items.set(item.key, next);
  }
  return [...items.values()];
}

export function appendOperation(account: LocalAccount, kind: Operation["kind"], item: SyncItem, extra: Partial<Operation> = {}): Operation {
  const op: Operation = {
    id: newId(), kind, target: item.key, base: structuredClone(item), delayed: true,
    ...(item.pendingFrom ? { baseFrom: item.pendingFrom } : {}), ...extra,
  };
  account.queue.push(op);
  return op;
}
