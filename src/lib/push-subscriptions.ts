import "server-only";
import { db } from "./db";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface StoredPushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function assertBase64Url(value: string, field: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) {
    throw new Error(`Invalid push subscription ${field}.`);
  }
  return value;
}

function parseSubscription(value: unknown): PushSubscriptionInput {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid push subscription.");
  }

  const candidate = value as { endpoint?: unknown; keys?: unknown };
  if (typeof candidate.endpoint !== "string") {
    throw new Error("Invalid push subscription endpoint.");
  }
  const endpoint = candidate.endpoint.trim();
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error("Invalid push subscription endpoint.");
  }
  if (endpointUrl.protocol !== "https:" || endpoint.length > 2048) {
    throw new Error("Invalid push subscription endpoint.");
  }

  if (!candidate.keys || typeof candidate.keys !== "object") {
    throw new Error("Invalid push subscription keys.");
  }
  const keys = candidate.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    throw new Error("Invalid push subscription keys.");
  }

  return {
    endpoint,
    keys: {
      p256dh: assertBase64Url(keys.p256dh, "p256dh"),
      auth: assertBase64Url(keys.auth, "auth"),
    },
  };
}

export function savePushSubscription(userId: number, value: unknown): void {
  const subscription = parseSubscription(value);
  db.prepare(
    `INSERT INTO push_subscriptions
       (user_id, endpoint, p256dh, auth, created_at, updated_at, last_error)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       updated_at = datetime('now'),
       last_error = NULL`
  ).run(
    userId,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth
  );
}

export function deletePushSubscription(userId: number, endpointValue: unknown): boolean {
  if (typeof endpointValue !== "string") {
    throw new Error("Invalid push subscription endpoint.");
  }
  const endpoint = endpointValue.trim();
  try {
    if (new URL(endpoint).protocol !== "https:" || endpoint.length > 2048) {
      throw new Error("Invalid push subscription endpoint.");
    }
  } catch {
    throw new Error("Invalid push subscription endpoint.");
  }
  const result = db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .run(userId, endpoint);
  return result.changes > 0;
}

export function listRecipientPushSubscriptions(
  excludedUserId: number
): StoredPushSubscription[] {
  return db
    .prepare(
      `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id <> ?
       ORDER BY id ASC`
    )
    .all(excludedUserId) as StoredPushSubscription[];
}

export function listUserPushSubscriptions(userId: number): StoredPushSubscription[] {
  return db
    .prepare(
      `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id = ?
       ORDER BY id ASC`
    )
    .all(userId) as StoredPushSubscription[];
}

export function markPushSubscriptionSuccess(id: number): void {
  db.prepare(
    `UPDATE push_subscriptions
     SET last_success_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
}

export function markPushSubscriptionFailure(id: number, error: unknown): void {
  const message = error instanceof Error ? error.message : "Push delivery failed";
  db.prepare(
    `UPDATE push_subscriptions
     SET last_error = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(message.slice(0, 500), id);
}

export function removePushSubscriptionById(id: number): void {
  db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(id);
}
