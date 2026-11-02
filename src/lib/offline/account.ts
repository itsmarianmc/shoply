import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";

export function accountKeyFor(userId: number): string {
  db.prepare("INSERT OR IGNORE INTO offline_accounts (user_id, account_key) VALUES (?, ?)").run(userId, randomUUID());
  return (db.prepare("SELECT account_key FROM offline_accounts WHERE user_id = ?").get(userId) as { account_key: string }).account_key;
}
