import "server-only";
import { db } from "./db";

export const SHOPPING_SESSION_TIMEOUT_MINUTES = 60;

export interface ShoppingSessionActivity {
  sessionId: number;
  started: boolean;
}

export function recordSuccessfulCheck(userId: number): ShoppingSessionActivity {
  db.prepare(
    `UPDATE shopping_sessions
     SET ended_at = datetime('now')
     WHERE ended_at IS NULL
       AND last_activity_at <= datetime('now', ?)`
  ).run(`-${SHOPPING_SESSION_TIMEOUT_MINUTES} minutes`);

  const active = db
    .prepare(
      `SELECT id FROM shopping_sessions
       WHERE ended_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get() as { id: number } | undefined;

  if (active) {
    db.prepare(
      `UPDATE shopping_sessions
       SET last_activity_at = datetime('now')
       WHERE id = ? AND ended_at IS NULL`
    ).run(active.id);
    return { sessionId: active.id, started: false };
  }

  const result = db
    .prepare(
      `INSERT INTO shopping_sessions
       (started_by_user_id, started_at, last_activity_at, notification_sent_at)
       VALUES (?, datetime('now'), datetime('now'), datetime('now'))`
    )
    .run(userId);

  return { sessionId: Number(result.lastInsertRowid), started: true };
}

export function endActiveShoppingSession(): void {
  db.prepare(
    `UPDATE shopping_sessions
     SET ended_at = datetime('now'), last_activity_at = datetime('now')
     WHERE ended_at IS NULL`
  ).run();
}
