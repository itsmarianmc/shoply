-- Installed after legacy item-column migrations. Receipts and tombstones have
-- no time-based expiry: a device may retry after an arbitrarily long absence.
CREATE TABLE IF NOT EXISTS offline_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS sync_receipts (
  account_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_key, operation_id)
);
CREATE TABLE IF NOT EXISTS sync_item_links (
  account_key TEXT NOT NULL,
  local_key TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  PRIMARY KEY (account_key, local_key)
);
CREATE TABLE IF NOT EXISTS item_versions (
  item_id INTEGER PRIMARY KEY,
  name INTEGER NOT NULL DEFAULT 1,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit INTEGER NOT NULL DEFAULT 1,
  note INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER NOT NULL DEFAULT 1,
  lifecycle INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO item_versions (item_id) SELECT id FROM items;
CREATE TRIGGER IF NOT EXISTS sync_item_insert AFTER INSERT ON items BEGIN
  INSERT INTO item_versions (item_id) VALUES (NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS sync_item_update AFTER UPDATE ON items BEGIN
  UPDATE item_versions SET
    name = name + (OLD.name IS NOT NEW.name),
    quantity = quantity + (OLD.quantity IS NOT NEW.quantity),
    unit = unit + (OLD.unit IS NOT NEW.unit),
    note = note + (OLD.note IS NOT NEW.note),
    category_id = category_id + (OLD.category_id IS NOT NEW.category_id),
    lifecycle = lifecycle + (OLD.status IS NOT NEW.status OR OLD.archived IS NOT NEW.archived
      OR OLD.shopping_completed_at IS NOT NEW.shopping_completed_at
      OR OLD.checked_by_user_id IS NOT NEW.checked_by_user_id OR OLD.checked_at IS NOT NEW.checked_at),
    version = version + 1
  WHERE item_id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS sync_item_delete AFTER DELETE ON items BEGIN
  UPDATE item_versions SET deleted = 1, version = version + 1, lifecycle = lifecycle + 1 WHERE item_id = OLD.id;
END;
