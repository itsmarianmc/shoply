import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import {
  normalizeItemName,
  addItem,
  checkItem,
  uncheckItem,
  restoreItem,
  deleteItem,
  updateItem,
  completeShopping,
  findDuplicateActiveItem,
  tryMergeDuplicate,
  getAutocompleteSuggestions,
  getRecentItems,
  undoCheckItem,
  resolveItemDefaults,
  addItemWithMerge,
} from "@/lib/items";
import {
  getDefaultCategoryId,
  createCategory,
  deleteCategory,
  moveItemToCategory,
} from "@/lib/categories";
import { setCheckedItemBehavior } from "@/lib/settings";
import type { ItemWithNames } from "@/lib/types";

const USER_ID = 1;

function getItemsInCategory(categoryId: number): ItemWithNames[] {
  return db
    .prepare("SELECT * FROM items WHERE category_id = ? ORDER BY id ASC")
    .all(categoryId) as ItemWithNames[];
}

function getDefaultItems() {
  return getItemsInCategory(getDefaultCategoryId());
}

function getHistory(name: string) {
  return db
    .prepare("SELECT * FROM item_history WHERE normalized_name = ?")
    .get(normalizeItemName(name));
}

beforeAll(() => {
  db.prepare(
    "INSERT INTO users (name, role, password_hash) VALUES ('test', 'ADMIN', 'x')"
  ).run();
});

describe("normalizeItemName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeItemName("  Tomaten  ")).toBe("tomaten");
    expect(normalizeItemName("Halloumi   Cheese")).toBe("halloumi cheese");
    expect(normalizeItemName("VEGETABLES")).toBe("vegetables");
  });
});

describe("addItem", () => {
  it("adds an item with quantity, unit and note", () => {
    addItem("Tomatoes", USER_ID, { quantity: 3, unit: "kg", note: "large" });
    const items = getDefaultItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Tomatoes",
      quantity: 3,
      unit: "kg",
      note: "large",
      status: "ACTIVE",
      archived: 0,
    });
  });

  it("adds an item without quantity/unit/note", () => {
    addItem("Milk", USER_ID);
    const items = getDefaultItems();
    const milk = items.find((i) => i.name === "Milk");
    expect(milk).toMatchObject({ quantity: null, unit: null, note: null });
  });

  it("rejects empty names", () => {
    expect(() => addItem("   ", USER_ID)).toThrow("Item name cannot be empty.");
  });
});

describe("updateItem", () => {
  it("updates quantity, unit and note", () => {
    addItem("Bread", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Bread")!;
    updateItem(row.id, { quantity: 1, unit: "piece", note: "from bakery" });
    const updated = db
      .prepare("SELECT * FROM items WHERE id = ?")
      .get(row.id) as any;
    expect(updated).toMatchObject({
      quantity: 1,
      unit: "piece",
      note: "from bakery",
    });
  });

  it("clears values when set to null", () => {
    const row = getDefaultItems().find((i) => i.name === "Bread")!;
    updateItem(row.id, { quantity: null, unit: null, note: null });
    const updated = db
      .prepare("SELECT * FROM items WHERE id = ?")
      .get(row.id) as any;
    expect(updated).toMatchObject({ quantity: null, unit: null, note: null });
  });
});

describe("category memory", () => {
  it("reuses the remembered category when the item name is added again", () => {
    const dm = createCategory("drugstore");
    addItem("Oats", USER_ID, { quantity: 1 });

    const first = getDefaultItems().find((i) => i.name === "Oats")!;
    checkItem(first.id, USER_ID);

    const dmId = (
      db.prepare("SELECT id FROM categories WHERE name = 'drugstore'").get() as {
        id: number;
      }
    ).id;
    moveItemToCategory(first.id, dmId);

    addItem("Oats", USER_ID, { quantity: 2 });
    const added = getItemsInCategory(dmId).find(
      (i) => i.name === "Oats" && i.id !== first.id
    );
    expect(added).toBeDefined();
    expect(added!.quantity).toBe(2);
    expect(resolveItemDefaults("Oats").categoryId).toBe(dmId);
  });

  it("falls back to the default category when the remembered category was deleted", () => {
    const temp = createCategory("farmers market");
    const tempId = db
      .prepare("SELECT id FROM categories WHERE name = 'farmers market'")
      .get() as { id: number };
    db.prepare(
      `INSERT INTO item_history (normalized_name, display_name, category_id, category_name, use_count)
       VALUES ('potatoes', 'Potatoes', ?, 'farmers market', 2)`
    ).run(tempId.id);
    deleteCategory(tempId.id);

    expect(resolveItemDefaults("Potatoes").categoryId).toBe(
      getDefaultCategoryId()
    );
  });
});

describe("checkItem (history + race protection)", () => {
  it("increments use_count on every check", () => {
    addItem("Yogurt", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Yogurt")!;

    expect(checkItem(row.id, USER_ID)).toEqual({ archived: false });
    const h1 = getHistory("Yogurt") as any;
    expect(h1.use_count).toBe(1);
    expect(h1.category_name).toBe("Uncategorized");

    uncheckItem(row.id);
    checkItem(row.id, USER_ID);
    const h2 = getHistory("Yogurt") as any;
    expect(h2.use_count).toBe(2);
  });

  it("returns null (no-op) when the item was already checked (race)", () => {
    addItem("Eggs", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Eggs")!;

    expect(checkItem(row.id, USER_ID)).toEqual({ archived: false });
    expect(checkItem(row.id, USER_ID)).toBeNull();
  });

  it("archives the item when ARCHIVE behavior is set and undo restores it", () => {
    setCheckedItemBehavior("ARCHIVE");
    addItem("Butter", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Butter")!;

    const result = checkItem(row.id, USER_ID);
    expect(result).toEqual({ archived: true });

    const archived = db.prepare("SELECT archived FROM items WHERE id = ?").get(row.id) as { archived: number };
    expect(archived.archived).toBe(1);

    undoCheckItem(row.id);
    const restored = db.prepare("SELECT * FROM items WHERE id = ?").get(row.id) as any;
    expect(restored).toMatchObject({ status: "ACTIVE", archived: 0 });

    setCheckedItemBehavior("KEEP_IN_LIST");
  });

  it("undoes a KEEP_IN_LIST check (non-archived)", () => {
    setCheckedItemBehavior("KEEP_IN_LIST");
    addItem("Cheese", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Cheese")!;

    checkItem(row.id, USER_ID);
    undoCheckItem(row.id);
    const restored = db.prepare("SELECT * FROM items WHERE id = ?").get(row.id) as any;
    expect(restored).toMatchObject({ status: "ACTIVE", archived: 0 });
  });
});

describe("category moves remember the category", () => {
  it("moveItemToCategory updates item_history so autocomplete shows the target", () => {
    createCategory("pharmacy");
    addItem("Granola", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Granola")!;

    const pharmacyId = (
      db.prepare("SELECT id FROM categories WHERE name = 'pharmacy'").get() as {
        id: number;
      }
    ).id;
    moveItemToCategory(row.id, pharmacyId);

    const item = db.prepare("SELECT category_id FROM items WHERE id = ?").get(row.id) as { category_id: number };
    expect(item.category_id).toBe(pharmacyId);
    const h = getHistory("Granola") as any;
    expect(h.category_id).toBe(pharmacyId);
    expect(h.category_name).toBe("pharmacy");
  });
});

describe("archiving and deletion", () => {
  it("restoreItem brings an archived item back to ACTIVE", () => {
    setCheckedItemBehavior("ARCHIVE");
    addItem("Dish Soap", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Dish Soap")!;
    checkItem(row.id, USER_ID);
    restoreItem(row.id);
    const restored = db.prepare("SELECT * FROM items WHERE id = ?").get(row.id) as any;
    expect(restored).toMatchObject({ status: "ACTIVE", archived: 0 });
    setCheckedItemBehavior("KEEP_IN_LIST");
  });

  it("deleteItem only removes CHECKED / archived items", () => {
    addItem("Keep Me", USER_ID);
    const active = getDefaultItems().find((i) => i.name === "Keep Me")!;
    deleteItem(active.id);
    expect(db.prepare("SELECT COUNT(*) AS c FROM items WHERE id = ?").get(active.id)).toEqual({ c: 1 });

    checkItem(active.id, USER_ID);
    deleteItem(active.id);
    expect(db.prepare("SELECT COUNT(*) AS c FROM items WHERE id = ?").get(active.id)).toEqual({ c: 0 });
  });

  it("completeShopping archives every checked item and nothing else", () => {
    setCheckedItemBehavior("KEEP_IN_LIST");
    addItem("Shirt", USER_ID);
    addItem("Pants", USER_ID);
    const hA = getDefaultItems().find((i) => i.name === "Shirt")!;
    const hB = getDefaultItems().find((i) => i.name === "Pants")!;
    checkItem(hA.id, USER_ID);

    const count = completeShopping();
    expect(count).toBeGreaterThanOrEqual(1);

    const a = db.prepare("SELECT archived FROM items WHERE id = ?").get(hA.id) as { archived: number };
    const b = db.prepare("SELECT archived FROM items WHERE id = ?").get(hB.id) as { archived: number };
    expect(a.archived).toBe(1);
    expect(b.archived).toBe(0);
  });
});

describe("duplicate handling", () => {
  it("keeps repeated add/merge decision inside one transaction", () => {
    addItemWithMerge("Rice", USER_ID, { quantity: 2, unit: "kg" });
    addItemWithMerge(" Rice ", USER_ID, { quantity: 3, unit: "kg" });
    const rows = getDefaultItems().filter((i) => i.name === "Rice");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(5);
  });
  it("merges duplicates when quantities exist and unit/note match", () => {
    addItem("Apple Juice", USER_ID, { quantity: 2, unit: "l" });
    const row = getDefaultItems().find((i) => i.name === "Apple Juice")!;

    const merged = tryMergeDuplicate(row.id, 3, "l", null);
    expect(merged).toBe(true);
    const updated = db.prepare("SELECT quantity FROM items WHERE id = ?").get(row.id) as { quantity: number };
    expect(updated.quantity).toBe(5);
  });

  it("does NOT merge when units differ", () => {
    addItem("Orange Juice", USER_ID, { quantity: 1, unit: "l" });
    const row = getDefaultItems().find((i) => i.name === "Orange Juice")!;
    expect(tryMergeDuplicate(row.id, 2, "ml", null)).toBe(false);
  });

  it("does NOT merge when one quantity is missing", () => {
    addItem("Water", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Water")!;
    expect(tryMergeDuplicate(row.id, 2, null, null)).toBe(false);
  });

  it("findDuplicateActiveItem finds same-name items in the same category", () => {
    addItem("Cucumber", USER_ID);
    const defaultId = getDefaultCategoryId();
    const dup = findDuplicateActiveItem("  cucumber ", defaultId);
    expect(dup).toBeDefined();
    expect(dup!.name).toBe("Cucumber");
  });
});

describe("autocomplete and recent items", () => {
  it("suggests matching history entries ordered by use_count", () => {
    addItem("Mango", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Mango")!;
    checkItem(row.id, USER_ID);

    const suggestions = getAutocompleteSuggestions("ma");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]!.display_name).toBe("Mango");
  });

  it("returns empty suggestions for an empty prefix", () => {
    expect(getAutocompleteSuggestions("  ")).toEqual([]);
  });

  it("recent items lists history by last_used_at", () => {
    addItem("Kiwi", USER_ID);
    const row = getDefaultItems().find((i) => i.name === "Kiwi")!;
    checkItem(row.id, USER_ID);

    const recent = getRecentItems(50);
    expect(recent.some((r) => r.display_name === "Kiwi")).toBe(true);
  });
});

describe("role-aware category memory", () => {
  it("member adds land in the default category even when history remembers another one", () => {
    db.prepare(
      "INSERT INTO users (name, role, password_hash) VALUES ('memb', 'MEMBER', 'x')"
    ).run();
    const memberId = (
      db.prepare("SELECT id FROM users WHERE name = 'memb'").get() as {
        id: number;
      }
    ).id;

    createCategory("Beverages");
    const beveragesId = (
      db.prepare("SELECT id FROM categories WHERE name = 'Beverages'").get() as {
        id: number;
      }
    ).id;

    addItem("Walnuts", USER_ID, { quantity: 3 });
    const walnuts = getDefaultItems().find((i) => i.name === "Walnuts")!;
    checkItem(walnuts.id, USER_ID);
    moveItemToCategory(walnuts.id, beveragesId);

    expect(resolveItemDefaults("Walnuts").categoryId).toBe(beveragesId);
    expect(resolveItemDefaults("Walnuts", undefined, false).categoryId).toBe(
      getDefaultCategoryId()
    );

    addItem("Walnuts", memberId, undefined, false);
    const memberItem = getItemsInCategory(getDefaultCategoryId()).find(
      (i) => i.name === "Walnuts" && i.id !== walnuts.id
    );
    expect(memberItem).toBeDefined();
    expect(memberItem!.quantity).toBe(3);

    const suggestions = getAutocompleteSuggestions("wal", 8, true);
    expect(
      suggestions.some(
        (s) =>
          s.display_name === "Walnuts" &&
          s.category_name === "Uncategorized"
      )
    ).toBe(true);
    const recent = getRecentItems(50, true);
    expect(
      recent.some(
        (r) =>
          r.display_name === "Walnuts" &&
          r.category_name === "Uncategorized"
      )
    ).toBe(true);
  });
});
