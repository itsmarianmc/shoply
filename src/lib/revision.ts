import "server-only";
import { db } from "./db";


export function bumpRevision(): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('revision', '1')
     ON CONFLICT(key) DO UPDATE SET
       value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
  ).run();
}

export function getRevision(): number {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'revision'")
    .get() as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}