import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shoply.db");

declare global {
  var __shoplyDb: Database.Database | undefined;
}

let connection: Database.Database | undefined = globalThis.__shoplyDb;

function migrate(db: Database.Database): void {
  const itemCols = new Set(
    (db.prepare("PRAGMA table_info(items)").all() as { name: string }[]).map(
      (c) => c.name
    )
  );
  if (!itemCols.has("quantity")) {
    db.exec("ALTER TABLE items ADD COLUMN quantity REAL");
  }
  if (!itemCols.has("unit")) {
    db.exec("ALTER TABLE items ADD COLUMN unit TEXT");
  }
  if (!itemCols.has("note")) {
    db.exec("ALTER TABLE items ADD COLUMN note TEXT");
  }
  if (!itemCols.has("shopping_completed_at")) {
    db.exec("ALTER TABLE items ADD COLUMN shopping_completed_at TEXT");
    // Existing archived items predate attachments and are already historical.
    db.exec("UPDATE items SET shopping_completed_at = COALESCE(archived_at, datetime('now')) WHERE archived = 1");
  }
  if (!itemCols.has("image_generation")) {
    db.exec("ALTER TABLE items ADD COLUMN image_generation INTEGER NOT NULL DEFAULT 0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS item_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_name  TEXT NOT NULL UNIQUE,
      display_name     TEXT NOT NULL,
      category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      category_name    TEXT NOT NULL,
      default_quantity REAL,
      default_unit     TEXT,
      use_count        INTEGER NOT NULL DEFAULT 0,
      last_used_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_item_history_name ON item_history(normalized_name);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint         TEXT NOT NULL,
      p256dh           TEXT NOT NULL,
      auth             TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      last_success_at  TEXT,
      last_error       TEXT,
      UNIQUE (user_id, endpoint)
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
      ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS shopping_sessions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      started_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      started_at            TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at      TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at              TEXT,
      notification_sent_at  TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_sessions_one_active
      ON shopping_sessions((1))
      WHERE ended_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_shopping_sessions_activity
      ON shopping_sessions(last_activity_at);
  `);
}

function createConnection(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
  const db = new BetterSqlite3(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  db.transaction(() => migrate(db))();

  return db;
}

function getConnection(): Database.Database {
  if (!connection) {
    connection = createConnection();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__shoplyDb = connection;
    }
  }
  return connection;
}

export const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    if (property === "transaction") {
      return (...transactionArgs: unknown[]) => (...runArgs: unknown[]) => {
        const activeConnection = getConnection();
        const transaction = (activeConnection.transaction as (...args: unknown[]) => (...args: unknown[]) => unknown)
          .apply(activeConnection, transactionArgs);
        return transaction(...runArgs);
      };
    }

    const activeConnection = getConnection();
    const value = Reflect.get(activeConnection, property, activeConnection);
    return typeof value === "function" ? value.bind(activeConnection) : value;
  },
});
