import "server-only";
import { db } from "./db";
import { normalizeItemName } from "./items";
import { bumpRevision } from "./revision";
import type { Category, CategoryWithItems, ItemWithNames } from "./types";

const DEFAULT_CATEGORY_NAME = "Uncategorized";


export function getDefaultCategoryId(): number {
  const existing = db
    .prepare("SELECT id FROM categories WHERE is_default = 1")
    .get() as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db
    .prepare(
      "INSERT INTO categories (name, sort_order, is_default) VALUES (?, -1, 1)"
    )
    .run(DEFAULT_CATEGORY_NAME);
  return Number(result.lastInsertRowid);
}

export function getAllCategories(): Category[] {
  return db
    .prepare("SELECT * FROM categories ORDER BY is_default DESC, sort_order ASC, name ASC")
    .all() as Category[];
}


export function getCategoriesWithItems(): CategoryWithItems[] {
  getDefaultCategoryId();
  const categories = getAllCategories();

  const itemStmt = db.prepare(
    `SELECT i.*, images.id AS image_id, added.name AS added_by_name, checked.name AS checked_by_name
     FROM items i
     LEFT JOIN item_images images ON images.item_id = i.id AND images.state = 'READY'
     LEFT JOIN users added ON added.id = i.added_by_user_id
     LEFT JOIN users checked ON checked.id = i.checked_by_user_id
     WHERE i.category_id = ? AND i.archived = 0
     ORDER BY
       CASE i.status WHEN 'ACTIVE' THEN 0 ELSE 1 END ASC,
       i.created_at ASC`
  );

  return categories.map((category) => ({
    ...category,
    items: itemStmt.all(category.id) as ItemWithNames[],
  }));
}

export function createCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name cannot be empty.");

  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories")
    .get() as { m: number };

  db.prepare(
    "INSERT INTO categories (name, sort_order, is_default) VALUES (?, ?, 0)"
  ).run(trimmed, maxOrder.m + 1);
  bumpRevision();
}

export function renameCategory(categoryId: number, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Category name cannot be empty.");

  const category = db
    .prepare("SELECT is_default FROM categories WHERE id = ?")
    .get(categoryId) as { is_default: 0 | 1 } | undefined;

  if (!category) throw new Error("Category not found.");
  if (category.is_default) {
    throw new Error('"Uncategorized" cannot be renamed.');
  }

  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(trimmed, categoryId);

  db.prepare("UPDATE item_history SET category_name = ? WHERE category_id = ?").run(
    trimmed,
    categoryId
  );

  bumpRevision();
}


export const deleteCategory = db.transaction((categoryId: number): void => {
  const category = db
    .prepare("SELECT is_default FROM categories WHERE id = ?")
    .get(categoryId) as { is_default: 0 | 1 } | undefined;

  if (!category) throw new Error("Category not found.");
  if (category.is_default) {
    throw new Error('"Uncategorized" cannot be deleted.');
  }

  const defaultId = getDefaultCategoryId();

  db.prepare("UPDATE items SET category_id = ? WHERE category_id = ?").run(
    defaultId,
    categoryId
  );

  db.prepare("DELETE FROM categories WHERE id = ?").run(categoryId);

  bumpRevision();
});


export const moveItemToCategory = db.transaction(
  (itemId: number, categoryId: number): void => {
    const category = db
      .prepare("SELECT id, name FROM categories WHERE id = ?")
      .get(categoryId) as { id: number; name: string } | undefined;
    if (!category) throw new Error("Target category not found.");

    const item = db
      .prepare("SELECT name, quantity, unit FROM items WHERE id = ?")
      .get(itemId) as
      | { name: string; quantity: number | null; unit: string | null }
      | undefined;
    if (!item) throw new Error("Item not found.");

    db.prepare("UPDATE items SET category_id = ? WHERE id = ?").run(categoryId, itemId);

    const normalized = normalizeItemName(item.name);
    db.prepare(
      `INSERT INTO item_history (normalized_name, display_name, category_id, category_name, default_quantity, default_unit, use_count, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT(normalized_name) DO UPDATE SET
         display_name = excluded.display_name,
         category_id = excluded.category_id,
         category_name = excluded.category_name,
         default_quantity = COALESCE(excluded.default_quantity, item_history.default_quantity),
         default_unit = COALESCE(excluded.default_unit, item_history.default_unit),
         use_count = item_history.use_count + 1,
         last_used_at = datetime('now')`
    ).run(
      normalized,
      item.name,
      category.id,
      category.name,
      item.quantity,
      item.unit
    );

    bumpRevision();
  }
);
