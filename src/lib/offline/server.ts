import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { accountKeyFor } from "./account";
import { getAllCategories, getDefaultCategoryId, moveItemToCategory } from "../categories";
import { addItem, checkItem, deleteItem, findDuplicateActiveItem, getItemById, getPendingShoppingCount,
  restoreItem, tryMergeDuplicate, undoCheckItem, uncheckItem, updateItem } from "../items";
import { getCheckedItemBehavior } from "../settings";
import { getRevision, bumpRevision } from "../revision";
import { getImageStorageUsage, queueItemImageDeletion } from "../item-images";
import { endActiveShoppingSession } from "../shopping-sessions";
import { assertPositiveSafeId, validateItemFields } from "../validation";
import type { PublicUser } from "../types";
import { EDIT_FIELDS, type Operation, type Receipt, type Snapshot, type Suggestion, type SyncItem, type Versions } from "./types";

export function syncItem(id: number): SyncItem | null {
  const item = getItemById(id) as (ReturnType<typeof getItemById> & { shopping_completed_at: string | null });
  if (!item) return null;
  const versions = db.prepare("SELECT name, quantity, unit, note, category_id, lifecycle, version FROM item_versions WHERE item_id = ?").get(id) as Versions;
  return { ...item, key: `s:${id}`, versions };
}

export function getSnapshot(user: PublicUser): Snapshot {
  getDefaultCategoryId();
  const imageStorage = getImageStorageUsage();
  return db.transaction((): Snapshot => {
    const categories = getAllCategories();
    const history = db.prepare(`SELECT display_name, category_id, category_name, default_quantity, default_unit, use_count, last_used_at
      FROM item_history ORDER BY use_count DESC, last_used_at DESC LIMIT 500`).all() as Suggestion[];
    const defaultCategory = categories.find(c => c.is_default)!;
    return {
      protocol: 1, accountKey: accountKeyFor(user.id), user, revision: getRevision(),
      items: (db.prepare("SELECT id FROM items ORDER BY created_at, id").all() as { id: number }[]).map(({ id }) => syncItem(id)!),
      categories, history: user.role === "ADMIN" ? history : history.map(h => ({ ...h, category_id: defaultCategory.id, category_name: defaultCategory.name })),
      behavior: getCheckedItemBehavior(), imageStorage,
      links: Object.fromEntries((db.prepare("SELECT local_key, item_id FROM sync_item_links WHERE account_key = ?").all(accountKeyFor(user.id)) as { local_key: string; item_id: number }[]).map(row => [row.local_key, row.item_id])),
    };
  })();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateOperation(input: unknown): Operation {
  if (!input || typeof input !== "object") throw new Error("Invalid operation.");
  const op = input as Operation;
  if (!uuid.test(op.id) || typeof op.target !== "string" ||
    !(/^s:[1-9][0-9]*$/.test(op.target) || (op.target.startsWith("c:") && uuid.test(op.target.slice(2)))) ||
    !["add", "edit", "check", "uncheck", "undo", "delete", "restore", "complete", "accept"].includes(op.kind) ||
    typeof op.delayed !== "boolean" || (op.baseFrom !== undefined && !uuid.test(op.baseFrom))) throw new Error("Invalid operation envelope.");
  for (const item of [op.base, op.duplicate]) {
    if (item != null && (!item.versions || ![...EDIT_FIELDS, "lifecycle", "version"].every(k => Number.isSafeInteger(item.versions[k as keyof Versions]) && item.versions[k as keyof Versions] > 0))) {
      throw new Error("Missing item preconditions.");
    }
  }
  if (op.kind === "add") {
    if (!op.target.startsWith("c:") || !op.fields) throw new Error("Invalid new item.");
    validateItemFields(op.fields.name, op.fields);
    assertPositiveSafeId(op.categoryId, "category");
    if (op.duplicate) assertPositiveSafeId(op.duplicate.id, "duplicate");
  } else if (op.kind !== "accept" && !op.base) throw new Error("Missing item preconditions.");
  if (op.kind === "edit") {
    if (!op.patch || Object.keys(op.patch).some(k => !(EDIT_FIELDS as readonly string[]).includes(k))) throw new Error("Invalid item edit.");
    validateItemFields(op.patch.name ?? "valid", op.patch);
    if (op.patch.category_id !== undefined) assertPositiveSafeId(op.patch.category_id, "category");
  }
  if (op.adoptId !== undefined) {
    if (op.kind !== "accept" || !op.target.startsWith("c:")) throw new Error("Invalid identity adoption.");
    assertPositiveSafeId(op.adoptId);
  }
  return op;
}

function receiptFor(account: string, id: string): Receipt | undefined {
  const row = db.prepare("SELECT result FROM sync_receipts WHERE account_key = ? AND operation_id = ?").get(account, id) as { result: string } | undefined;
  return row && JSON.parse(row.result) as Receipt;
}

function resolveId(account: string, target: string): number | null {
  if (target.startsWith("s:")) return assertPositiveSafeId(target.slice(2));
  const link = db.prepare("SELECT item_id FROM sync_item_links WHERE account_key = ? AND local_key = ?").get(account, target) as { item_id: number } | undefined;
  return link?.item_id ?? null;
}

function apply(user: PublicUser, account: string, op: Operation, live: boolean): Receipt {
  const id = resolveId(account, op.target) ?? (op.kind === "accept" ? op.adoptId ?? null : null);
  const current = id ? syncItem(id) : null;
  const problem = (message: string, outcome: "conflict" | "blocked" = "conflict"): Receipt => ({ outcome, message, item: current });
  let base = op.base;
  if (op.baseFrom) {
    const dependency = receiptFor(account, op.baseFrom);
    if (!dependency || dependency.outcome !== "applied" || dependency.serverId !== id) return problem("An earlier change must be resolved first.", "blocked");
    base = dependency.item;
  }
  if (op.kind === "add") {
    if (id) return problem("This local identity was already used.", "blocked");
    const fields = validateItemFields(op.fields!.name, op.fields);
    const category = getAllCategories().find(c => c.id === op.categoryId);
    if (!category) return problem("The saved category no longer exists.");
    if (user.role !== "ADMIN" && !category.is_default) return problem("Only administrators may choose a category.", "blocked");
    const duplicate = findDuplicateActiveItem(fields.name, category.id);
    let itemId: number;
    if (op.duplicate) {
      const seen = syncItem(op.duplicate.id);
      if (!duplicate || duplicate.id !== op.duplicate.id || !seen || seen.versions.version !== op.duplicate.versions.version) {
        return { outcome: "conflict", message: "The item you intended to combine with has changed. Keep both items or use the shared item.", item: seen };
      }
      if (tryMergeDuplicate(duplicate.id, fields.quantity, fields.unit, fields.note)) itemId = duplicate.id;
      else itemId = insertExact(fields, user, category.id);
    } else {
      // Unseen concurrent additions are separate intentions. Never silently
      // combine them (subsequent edits refer to the newly created identity).
      itemId = insertExact(fields, user, category.id);
    }
    db.prepare("INSERT INTO sync_item_links (account_key, local_key, item_id) VALUES (?, ?, ?)").run(account, op.target, itemId);
    return { outcome: "applied", item: syncItem(itemId), serverId: itemId };
  }
  if (op.kind === "accept") {
    if ((base === null) !== (current === null) || (base && current && base.versions.version !== current.versions.version)) return problem("The shared item changed again. Review the latest values.");
    if (op.target.startsWith("c:") && id) db.prepare("INSERT OR IGNORE INTO sync_item_links (account_key, local_key, item_id) VALUES (?, ?, ?)").run(account, op.target, id);
    return { outcome: "applied", item: current, ...(id ? { serverId: id } : {}) };
  }
  if (!current || !id) {
    if (op.kind === "delete" && id && base) {
      const tombstone = db.prepare("SELECT version, deleted FROM item_versions WHERE item_id = ?").get(id) as { version: number; deleted: number } | undefined;
      if (tombstone?.deleted && tombstone.version === base.versions.version + 1) return { outcome: "applied", item: null, serverId: id };
    }
    return problem("This item was deleted. Your local intention has been retained; it will not recreate the item.");
  }
  if (!base) return problem("The earlier operation did not produce an item.", "blocked");
  const sameLife = current.versions.lifecycle === base.versions.lifecycle;
  const sameAll = current.versions.version === base.versions.version;
  if (op.kind === "edit") {
    const patch = op.patch!;
    if (patch.name !== undefined && patch.name !== current.name && user.role !== "ADMIN" && current.added_by_user_id !== user.id) return problem("You can only rename items you added.", "blocked");
    if (patch.category_id !== undefined && user.role !== "ADMIN") return problem("Only administrators may move items.", "blocked");
    if (patch.category_id !== undefined && !getAllCategories().some(c => c.id === patch.category_id)) return problem("The selected category was removed.");
    if (!sameLife) return problem("The item's checked, archive, or completion state changed. Review your edit.");
    for (const field of EDIT_FIELDS) {
      if (field in patch && current[field] !== patch[field] && current.versions[field] !== base.versions[field]) return problem(`Both copies changed ${field === "category_id" ? "category" : field}. Choose which value to keep.`);
    }
    const fields = validateItemFields(patch.name ?? current.name, {
      quantity: "quantity" in patch ? patch.quantity : current.quantity,
      unit: "unit" in patch ? patch.unit : current.unit, note: "note" in patch ? patch.note : current.note,
    });
    if (EDIT_FIELDS.some(f => f in patch && patch[f] !== current[f])) {
      updateItem(id, fields);
      if (patch.category_id !== undefined && patch.category_id !== current.category_id) moveItemToCategory(id, patch.category_id);
    }
  } else if (op.kind === "check") {
    if (current.status === "CHECKED" && !current.shopping_completed_at &&
      (sameLife || current.versions.lifecycle === base.versions.lifecycle + 1) && base.status === "ACTIVE") {
      return { outcome: "applied", item: current, serverId: id };
    }
    if (!sameLife || current.status !== "ACTIVE" || current.archived) return problem("This item changed before it could be checked.");
    const result = checkItem(id, user.id);
    return { outcome: "applied", item: syncItem(id), serverId: id,
      ...(!op.delayed && live && result?.sessionStarted && result.sessionId ? { notificationSessionId: result.sessionId } : {}) };
  } else if (op.kind === "uncheck" || op.kind === "undo") {
    if (current.status === "ACTIVE" && !current.archived && !current.shopping_completed_at &&
      current.versions.lifecycle === base.versions.lifecycle + 1 && base.status === "CHECKED") return { outcome: "applied", item: current, serverId: id };
    if (!sameLife || current.shopping_completed_at || (op.kind === "uncheck" && current.archived)) return problem("This check changed or was completed. Restore completed items from the archive.");
    if (op.kind === "undo") undoCheckItem(id); else uncheckItem(id);
  } else if (op.kind === "delete") {
    if (!sameAll) return problem("The item changed before deletion. Review it before deleting.");
    if (current.status !== "CHECKED" && !current.archived) return problem("Only checked or archived items can be deleted.", "blocked");
    deleteItem(id, false);
  } else if (op.kind === "restore") {
    if (!current.archived && current.status === "ACTIVE" && current.versions.lifecycle === base.versions.lifecycle + 1) return { outcome: "applied", item: current, serverId: id };
    if (!sameLife || !current.archived) return problem("This archived item changed before restoration.");
    restoreItem(id, false);
  } else if (op.kind === "complete") {
    // Identical completion of the same check is satisfied, including attribution.
    if (current.shopping_completed_at && base.status === "CHECKED" && !base.shopping_completed_at &&
      current.checked_at === base.checked_at && current.checked_by_user_id === base.checked_by_user_id &&
      current.versions.lifecycle === base.versions.lifecycle + 1 && EDIT_FIELDS.every(f => current.versions[f] === base!.versions[f])) {
      return { outcome: "applied", item: current, serverId: id };
    }
    if (!sameAll || current.status !== "CHECKED" || current.shopping_completed_at) return problem("This item changed during the trip and was not completed. Other completed items stay completed.");
    queueItemImageDeletion(id);
    db.prepare(`UPDATE items SET archived = 1, archived_at = COALESCE(archived_at, datetime('now')),
      shopping_completed_at = datetime('now'), image_generation = image_generation + 1 WHERE id = ?`).run(id);
    if (getPendingShoppingCount() === 0) endActiveShoppingSession();
    bumpRevision();
  }
  return { outcome: "applied", item: syncItem(id), serverId: id };
}

function insertExact(fields: NonNullable<Operation["fields"]>, user: PublicUser, categoryId: number): number {
  const id = addItem(fields.name, user.id, fields, user.role === "ADMIN");
  // Defaults were already resolved against the saved snapshot on the device.
  db.prepare("UPDATE items SET quantity = ?, unit = ?, category_id = ? WHERE id = ?").run(fields.quantity, fields.unit, categoryId, id);
  return id;
}

export function applyOperation(user: PublicUser, account: string, input: unknown, live = false): { receipt: Receipt; replay: boolean } {
  const op = validateOperation(input);
  const hash = createHash("sha256").update(JSON.stringify(op)).digest("hex");
  return db.transaction(() => {
    // Obtain the SQLite write lock before checking a receipt (multiple servers).
    db.prepare("UPDATE app_settings SET value = value WHERE key = 'checked_item_behavior'").run();
    const currentUser = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(user.id) as PublicUser | undefined;
    if (!currentUser || accountKeyFor(currentUser.id) !== account) throw new Error("Account changed.");
    const previous = db.prepare("SELECT payload_hash, result FROM sync_receipts WHERE account_key = ? AND operation_id = ?").get(account, op.id) as { payload_hash: string; result: string } | undefined;
    if (previous) {
      if (previous.payload_hash !== hash) throw new Error("An operation ID cannot be reused for a different change.");
      return { receipt: JSON.parse(previous.result) as Receipt, replay: true };
    }
    const receipt = apply(currentUser, account, op, live);
    db.prepare("INSERT INTO sync_receipts (account_key, operation_id, payload_hash, result) VALUES (?, ?, ?, ?)").run(account, op.id, hash, JSON.stringify(receipt));
    return { receipt, replay: false };
  })();
}
