import "server-only";
import { db } from "./db";
import type { CheckedItemBehavior } from "./types";
import { bumpRevision } from "./revision";
import {
  DEFAULT_SHOPPING_SCAN_LANGUAGE,
  isShoppingScanLanguageCode,
  type ShoppingScanLanguageCode,
} from "./shopping-scan-languages";

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

export function getShoppingScanLanguage(): ShoppingScanLanguageCode {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'shopping_scan_language'")
    .get() as { value: string } | undefined;
  const value = row?.value;

  return isShoppingScanLanguageCode(value)
    ? value
    : DEFAULT_SHOPPING_SCAN_LANGUAGE;
}

export function setShoppingScanLanguage(value: string): void {
  if (!isShoppingScanLanguageCode(value)) {
    throw new Error("Unsupported shopping-list recognition language.");
  }
  const current = db
    .prepare("SELECT value FROM app_settings WHERE key = 'shopping_scan_language'")
    .get() as { value: string } | undefined;
  if (current?.value === value) return;

  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('shopping_scan_language', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(value);
}
