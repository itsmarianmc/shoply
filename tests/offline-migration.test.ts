import { expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
vi.unmock("@/lib/db");

it("safely initializes legacy item versions after column migration and is idempotent for fresh/restarted databases", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shoply-images-test-"));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = directory;
  const old = new Database(path.join(directory, "shoply.db"));
  const schema = fs.readFileSync("db/schema.sql", "utf8").replace(/^\s*shopping_completed_at TEXT,\r?\n/m, "").replace(/^\s*image_generation INTEGER NOT NULL DEFAULT 0,\r?\n/m, "");
  old.exec(schema);
  old.exec("INSERT INTO categories (name, is_default) VALUES ('Uncategorized', 1); INSERT INTO items (name, category_id) VALUES ('Legacy', 1);"); old.close();
  const { db } = await import("@/lib/db");
  try {
    expect(db.prepare("SELECT version, quantity, lifecycle FROM item_versions WHERE item_id = 1").get()).toEqual({ version: 1, quantity: 1, lifecycle: 1 });
    db.prepare("UPDATE items SET quantity = 3 WHERE id = 1").run();
    db.exec(fs.readFileSync("db/offline.sql", "utf8")); db.exec(fs.readFileSync("db/offline.sql", "utf8"));
    expect(db.prepare("SELECT version, quantity, lifecycle FROM item_versions WHERE item_id = 1").get()).toEqual({ version: 2, quantity: 2, lifecycle: 1 });
    db.prepare("DELETE FROM items WHERE id = 1").run();
    expect(db.prepare("SELECT deleted, version FROM item_versions WHERE item_id = 1").get()).toEqual({ deleted: 1, version: 3 });
    const fresh = new Database(":memory:"); fresh.exec(fs.readFileSync("db/schema.sql", "utf8")); fresh.exec(fs.readFileSync("db/offline.sql", "utf8")); fresh.exec(fs.readFileSync("db/offline.sql", "utf8")); fresh.close();
  } finally {
    db.close(); if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
  }
});
