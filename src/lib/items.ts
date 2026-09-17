import "server-only";
import { db } from "./db";
import { getDefaultCategoryId } from "./categories";
import { getCheckedItemBehavior } from "./settings";
import { bumpRevision } from "./revision";
import type { ItemWithNames } from "./types";
import { validateItemFields, parseQuantity, parseUnit } from "./validation";
import { endActiveShoppingSession, recordSuccessfulCheck } from "./shopping-sessions";


export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function addItem(
  name: string,
  userId: number,
  opts?: { quantity?: number | null; unit?: string | null; note?: string | null },
  
  canCategorize = true
): void {
  const validated = validateItemFields(name, opts);
  const trimmed = validated.name;

  const resolved = resolveItemDefaults(trimmed, undefined, canCategorize);
  const categoryId = resolved.categoryId;
  const quantity = validated.quantity ?? resolved.quantity ?? null;
  const unit = validated.unit ?? resolved.unit ?? null;
  const note = validated.note;

  db.prepare(
    `INSERT INTO items (name, quantity, unit, note, category_id, added_by_user_id, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0)`
  ).run(trimmed, quantity, unit, note, categoryId, userId);

  bumpRevision();
}


export const addItemWithMerge = db.transaction(
  (
    name: string,
    userId: number,
    opts?: { quantity?: unknown; unit?: unknown; note?: unknown },
    canCategorize = true
  ): { merged: boolean } => {
    const validated = validateItemFields(name, opts);
    const resolved = resolveItemDefaults(validated.name, undefined, canCategorize);
    const duplicate = findDuplicateActiveItem(validated.name, resolved.categoryId);
    if (duplicate && tryMergeDuplicate(duplicate.id, validated.quantity, validated.unit, validated.note)) {
      return { merged: true };
    }
    addItem(validated.name, userId, validated, canCategorize);
    return { merged: false };
  }
);

interface ResolvedItemDefaults {
  categoryId: number;
  quantity: number | null;
  unit: string | null;
}


export function resolveItemDefaults(
  name: string,
  explicitOpts?: {
    quantity?: number | null;
    unit?: string | null;
    note?: string | null;
  },
  canCategorize = true
): ResolvedItemDefaults {
  const normalized = normalizeItemName(name);

  const history = db
    .prepare(
      `SELECT category_id, default_quantity, default_unit
       FROM item_history WHERE normalized_name = ?`
    )
    .get(normalized) as
    | {
        category_id: number | null;
        default_quantity: number | null;
        default_unit: string | null;
      }
    | undefined;

  let categoryId = getDefaultCategoryId();
  if (canCategorize && history?.category_id) {
    const catExists = db
      .prepare("SELECT id FROM categories WHERE id = ?")
      .get(history.category_id);
    if (catExists) categoryId = history.category_id;
  }

  const quantity = explicitOpts?.quantity ?? history?.default_quantity ?? null;
  const unit = explicitOpts?.unit ?? history?.default_unit ?? null;

  return { categoryId, quantity, unit };
}


export interface CheckItemResult {
  archived: boolean;
  sessionStarted: boolean;
  sessionId: number | null;
}

export const checkItem = db.transaction(
  (itemId: number, userId: number): CheckItemResult | null => {
    const behavior = getCheckedItemBehavior();
    const shouldArchive = behavior === "ARCHIVE";

    const updateResult = db
      .prepare(
        `UPDATE items
         SET status = 'CHECKED',
             checked_by_user_id = ?,
             checked_at = datetime('now'),
             archived = ?,
             archived_at = CASE WHEN ? THEN datetime('now') ELSE archived_at END
         WHERE id = ? AND status = 'ACTIVE'`
      )
      .run(userId, shouldArchive ? 1 : 0, shouldArchive ? 1 : 0, itemId);

    if (updateResult.changes === 0) {
      return null;
    }

    const item = db
      .prepare(
        `SELECT i.name, i.category_id, c.name AS category_name, i.quantity, i.unit
         FROM items i
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE i.id = ?`
      )
      .get(itemId) as
      | {
          name: string;
          category_id: number;
          category_name: string;
          quantity: number | null;
          unit: string | null;
        }
      | undefined;

    if (item) {
      const normalized = normalizeItemName(item.name);
      let catName = item.category_name;
      if (!catName) {
        const catRow = db
          .prepare("SELECT name FROM categories WHERE id = ?")
          .get(item.category_id) as { name: string } | undefined;
        catName = catRow?.name ?? "Uncategorized";
      }

      db.prepare(
        `INSERT INTO item_history (normalized_name, display_name, category_id, category_name, default_quantity, default_unit, use_count, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
         ON CONFLICT(normalized_name) DO UPDATE SET
           category_id = excluded.category_id,
           category_name = excluded.category_name,
           default_quantity = COALESCE(excluded.default_quantity, item_history.default_quantity),
           default_unit = COALESCE(excluded.default_unit, item_history.default_unit),
           use_count = item_history.use_count + 1,
           last_used_at = datetime('now')`
      ).run(normalized, item.name, item.category_id, catName, item.quantity, item.unit);
    }

    const shoppingSession = recordSuccessfulCheck(userId);
    bumpRevision();

    const result: CheckItemResult = {
      archived: shouldArchive,
      sessionStarted: shoppingSession.started,
      sessionId: shoppingSession.sessionId,
    };
    Object.defineProperties(result, {
      sessionStarted: { value: shoppingSession.started, enumerable: false },
      sessionId: { value: shoppingSession.sessionId, enumerable: false },
    });
    return result;
  }
);


export function uncheckItem(itemId: number): boolean {
  const result = db.prepare(
    `UPDATE items
     SET status = 'ACTIVE', checked_by_user_id = NULL, checked_at = NULL
     WHERE id = ? AND status = 'CHECKED' AND archived = 0`
  ).run(itemId);
  if (result.changes > 0) bumpRevision();
  return result.changes > 0;
}

export function getArchivedItems(): ItemWithNames[] {
  return db
    .prepare(
      `SELECT i.*, added.name AS added_by_name, checked.name AS checked_by_name
       FROM items i
       LEFT JOIN users added ON added.id = i.added_by_user_id
       LEFT JOIN users checked ON checked.id = i.checked_by_user_id
       WHERE i.archived = 1
       ORDER BY i.archived_at DESC`
    )
    .all() as ItemWithNames[];
}


export function restoreItem(itemId: number): void {
  const result = db.prepare(
    `UPDATE items
     SET archived = 0, archived_at = NULL, status = 'ACTIVE',
         checked_by_user_id = NULL, checked_at = NULL
     WHERE id = ? AND archived = 1`
  ).run(itemId);
  if (result.changes > 0) bumpRevision();
}


export function archiveItem(itemId: number): void {
  const result = db.prepare(
    `UPDATE items
     SET archived = 1, archived_at = datetime('now')
     WHERE id = ? AND status = 'CHECKED' AND archived = 0`
  ).run(itemId);
  if (result.changes > 0) bumpRevision();
}


export function getItemById(itemId: number): ItemWithNames | undefined {
  return db
    .prepare(
      `SELECT i.*, added.name AS added_by_name, checked.name AS checked_by_name
       FROM items i
       LEFT JOIN users added ON added.id = i.added_by_user_id
       LEFT JOIN users checked ON checked.id = i.checked_by_user_id
       WHERE i.id = ?`
    )
    .get(itemId) as ItemWithNames | undefined;
}


export function updateItem(
  itemId: number,
  opts: { quantity?: number | null; unit?: string | null; note?: string | null }
): void {
  const quantity = parseQuantity(opts.quantity);
  const unit = parseUnit(opts.unit);
  const note = opts.note === undefined ? null : validateItemFields("valid", { note: opts.note }).note;

  const result = db.prepare(
    `UPDATE items
     SET quantity = ?,
         unit = ?,
         note = ?
     WHERE id = ?`
  ).run(quantity, unit, note, itemId);

  if (result.changes > 0) bumpRevision();
}


export function deleteItem(itemId: number): void {
  const result = db.prepare(
    `DELETE FROM items WHERE id = ? AND (status = 'CHECKED' OR archived = 1)`
  ).run(itemId);
  if (result.changes > 0) bumpRevision();
}


export const completeShopping = db.transaction((_userId?: number): number => {
  const result = db
    .prepare(
      `UPDATE items
       SET archived = 1, archived_at = datetime('now')
       WHERE status = 'CHECKED' AND archived = 0`
    )
    .run();

  endActiveShoppingSession();
  if (result.changes > 0) bumpRevision();
  return result.changes;
});


export function findDuplicateActiveItem(
  name: string,
  categoryId: number
): ItemWithNames | undefined {
  const normalized = normalizeItemName(name);
  const rows = db
    .prepare(
      `SELECT i.*, added.name AS added_by_name, checked.name AS checked_by_name
       FROM items i
       LEFT JOIN users added ON added.id = i.added_by_user_id
       LEFT JOIN users checked ON checked.id = i.checked_by_user_id
       WHERE i.status = 'ACTIVE' AND i.archived = 0 AND i.category_id = ?`
    )
    .all(categoryId) as ItemWithNames[];
  return rows.find((r) => normalizeItemName(r.name) === normalized);
}


export function tryMergeDuplicate(
  existingItemId: number,
  newQuantity: number | null,
  newUnit: string | null,
  newNote: string | null
): boolean {
  const safeQuantity = parseQuantity(newQuantity);
  const safeUnit = parseUnit(newUnit);
  const existing = db
    .prepare("SELECT quantity, unit, note FROM items WHERE id = ?")
    .get(existingItemId) as
    | { quantity: number | null; unit: string | null; note: string | null }
    | undefined;

  if (!existing) return false;

  if (existing.quantity == null || safeQuantity == null) return false;

  if ((existing.unit ?? null) !== (safeUnit ?? null)) return false;

  if ((existing.note ?? null) !== (newNote ?? null)) return false;

  const mergedQty = existing.quantity + safeQuantity;
  if (!Number.isFinite(mergedQty) || mergedQty > 1_000_000) return false;
  db.prepare("UPDATE items SET quantity = ? WHERE id = ?").run(
    mergedQty,
    existingItemId
  );
  bumpRevision();
  return true;
}



function defaultCategoryName(): string {
  const row = db
    .prepare("SELECT name FROM categories WHERE is_default = 1")
    .get() as { name: string } | undefined;
  return row?.name ?? "Uncategorized";
}


export function getAutocompleteSuggestions(
  prefix: string,
  limit = 8,
  maskCategory = false
): Array<{
  display_name: string;
  category_name: string;
  default_quantity: number | null;
  default_unit: string | null;
}> {
  const normalized = prefix.trim().toLowerCase();
  if (!normalized) return [];

  const rows = db
    .prepare(
      `SELECT display_name, category_name, default_quantity, default_unit
       FROM item_history
       WHERE normalized_name LIKE ?
       ORDER BY use_count DESC, last_used_at DESC
       LIMIT ?`
    )
    .all(`${normalized}%`, limit) as Array<{
    display_name: string;
    category_name: string;
    default_quantity: number | null;
    default_unit: string | null;
  }>;

  if (maskCategory) {
    const name = defaultCategoryName();
    return rows.map((r) => ({ ...r, category_name: name }));
  }
  return rows;
}


export function getRecentItems(
  limit = 10,
  maskCategory = false
): Array<{
  display_name: string;
  category_name: string;
  default_quantity: number | null;
  default_unit: string | null;
}> {
  const rows = db
    .prepare(
      `SELECT display_name, category_name, default_quantity, default_unit
       FROM item_history
       ORDER BY last_used_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    display_name: string;
    category_name: string;
    default_quantity: number | null;
    default_unit: string | null;
  }>;

  if (maskCategory) {
    const name = defaultCategoryName();
    return rows.map((r) => ({ ...r, category_name: name }));
  }
  return rows;
}


export function undoCheckItem(itemId: number): boolean {
  const result = db.prepare(
    `UPDATE items
     SET status = 'ACTIVE',
         checked_by_user_id = NULL,
         checked_at = NULL,
         archived = 0,
         archived_at = NULL
     WHERE id = ? AND status = 'CHECKED'`
  ).run(itemId);
  if (result.changes > 0) bumpRevision();
  return result.changes > 0;
}
