

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

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

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  
  
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_single_default
  ON categories(is_default)
  WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  quantity           REAL,
  unit               TEXT,
  note               TEXT,
  
  
  
  
  
  
  category_id        INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  added_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CHECKED')) DEFAULT 'ACTIVE',
  checked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_at         TEXT,
  archived           INTEGER NOT NULL DEFAULT 0,
  archived_at        TEXT,
  shopping_completed_at TEXT,
  image_generation INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status, archived);

-- A deletion queue survives item deletion and interrupted filesystem cleanup.
CREATE TABLE IF NOT EXISTS item_images (
  id TEXT PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  state TEXT NOT NULL CHECK (state IN ('READY', 'DELETE')) DEFAULT 'READY',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_images_one_ready
  ON item_images(item_id) WHERE state = 'READY';
CREATE TRIGGER IF NOT EXISTS item_images_deleted_item
  AFTER DELETE ON items BEGIN
    UPDATE item_images SET state = 'DELETE' WHERE item_id IS NULL;
  END;

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);


INSERT OR IGNORE INTO app_settings (key, value) VALUES ('checked_item_behavior', 'KEEP_IN_LIST');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('image_storage_limit_bytes', '1000000000');


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
