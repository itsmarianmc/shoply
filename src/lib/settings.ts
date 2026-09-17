import "server-only";
import { db } from "./db";
import type { CheckedItemBehavior } from "./types";
import { bumpRevision } from "./revision";

export function getCheckedItemBehavior(): CheckedItemBehavior {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'checked_item_behavior'")
    .get() as { value: string } | undefined;

  return row?.value === "ARCHIVE" ? "ARCHIVE" : "KEEP_IN_LIST";
}

export function setCheckedItemBehavior(value: CheckedItemBehavior): void {
  const current = getCheckedItemBehavior();
  if (current === value) return;
  const result = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('checked_item_behavior', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(value);
  if (result.changes > 0) bumpRevision();
}
