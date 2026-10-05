import { expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.unmock("@/lib/db");

it("initializes images and migrates existing items idempotently without reopening historical trips", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shoply-images-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const connection = new Database(path.join(directory, "shoply.db"));
  const oldSchema = fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8")
    .replace(/^\s*shopping_completed_at TEXT,\r?\n/m, "")
    .replace(/^\s*image_generation INTEGER NOT NULL DEFAULT 0,\r?\n/m, "");
  connection.exec(oldSchema);
  connection.prepare("INSERT INTO categories (name) VALUES ('Food')").run();
  connection.prepare("INSERT INTO items (name, category_id, status, archived, archived_at) VALUES ('Old trip', 1, 'CHECKED', 1, datetime('now'))").run();
  connection.close();
  const { db } = await import("@/lib/db");
  try {
    const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain("shopping_completed_at");
    expect(columns.map((column) => column.name)).toContain("image_generation");
    expect(db.prepare("SELECT COUNT(*) AS count FROM items WHERE status = 'CHECKED' AND shopping_completed_at IS NULL").get()).toEqual({ count: 0 });
    db.exec(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'image_storage_limit_bytes'").get()).toEqual({ value: "1000000000" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM item_images").get()).toEqual({ count: 0 });
  } finally {
    db.close();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
  }
});
