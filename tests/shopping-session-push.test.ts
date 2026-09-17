import { beforeEach, describe, expect, it, vi } from "vitest";

const webPushMock = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webPushMock }));

import { db } from "@/lib/db";
import { addItem, checkItem, completeShopping, undoCheckItem } from "@/lib/items";
import {
  deletePushSubscription,
  listRecipientPushSubscriptions,
  savePushSubscription,
} from "@/lib/push-subscriptions";
import { sendShoppingSessionStartedNotification, sendTestPushNotification } from "@/lib/push";

let nextUser = 1000;

function createUser(name = `push-user-${nextUser++}`): number {
  const result = db
    .prepare("INSERT INTO users (name, role, password_hash) VALUES (?, 'MEMBER', 'x')")
    .run(name);
  return Number(result.lastInsertRowid);
}

function createItem(userId: number, name = `item-${nextUser++}`): number {
  db.prepare(
    "INSERT OR IGNORE INTO categories (name, sort_order, is_default) VALUES ('Uncategorized', -1, 1)"
  ).run();
  db.prepare(
    "INSERT INTO items (name, category_id, added_by_user_id) VALUES (?, (SELECT id FROM categories WHERE is_default = 1), ?)"
  ).run(name, userId);
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
}

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
});

beforeEach(() => {
  db.exec("DELETE FROM push_subscriptions; DELETE FROM shopping_sessions; DELETE FROM items;");
  webPushMock.setVapidDetails.mockClear();
  webPushMock.sendNotification.mockReset();
  webPushMock.sendNotification.mockResolvedValue({});
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

describe("push subscriptions", () => {
  it("stores multiple devices and updates the same endpoint", () => {
    const userId = createUser();
    savePushSubscription(userId, subscription("https://push.example/device-a"));
    savePushSubscription(userId, subscription("https://push.example/device-b"));
    savePushSubscription(userId, {
      endpoint: "https://push.example/device-a",
      keys: { p256dh: "new-p256dh", auth: "new-auth" },
    });

    const rows = db
      .prepare("SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
      .all(userId) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.endpoint === "https://push.example/device-a")).toMatchObject({
      user_id: userId, p256dh: "new-p256dh", auth: "new-auth",
    });
  });

  it("only deletes the subscription of the signed-in user", () => {
    const ownerId = createUser();
    const otherId = createUser();
    const endpoint = "https://push.example/owned";
    savePushSubscription(ownerId, subscription(endpoint));

    expect(deletePushSubscription(otherId, endpoint)).toBe(false);
    expect(deletePushSubscription(ownerId, endpoint)).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get()).toEqual({ count: 0 });
  });

  it("sends a test notification only to the user's own devices", async () => {
    const userId = createUser("test-notification-user");
    const otherUserId = createUser("test-notification-other");
    savePushSubscription(userId, subscription("https://push.example/own-phone"));
    savePushSubscription(userId, subscription("https://push.example/own-tablet"));
    savePushSubscription(otherUserId, subscription("https://push.example/other-device"));

    await expect(sendTestPushNotification(userId)).resolves.toMatchObject({
      configured: true,
      attempted: 2,
      sent: 2,
    });
    expect(webPushMock.sendNotification.mock.calls.map(([target]) => target.endpoint).sort()).toEqual([
      "https://push.example/own-phone",
      "https://push.example/own-tablet",
    ]);
    expect(webPushMock.sendNotification.mock.calls[0]?.[1]).toContain('"type":"push-test"');
  });
});

describe("shopping sessions and push triggers", () => {
  it("starts exactly one session on the first successful check", () => {
    const userId = createUser();
    const itemId = createItem(userId);
    const result = checkItem(itemId, userId);

    expect(result).toMatchObject({ archived: false, sessionStarted: true });
    expect(db.prepare("SELECT COUNT(*) AS count FROM shopping_sessions WHERE ended_at IS NULL").get()).toEqual({ count: 1 });
    expect(checkItem(createItem(userId), userId)).toMatchObject({ sessionStarted: false });
    expect(db.prepare("SELECT COUNT(*) AS count FROM shopping_sessions").get()).toEqual({ count: 1 });
  });

  it("sends to every other user's devices but not to the initiator", async () => {
    const initiator = createUser("initiator");
    const recipient = createUser("recipient");
    savePushSubscription(initiator, subscription("https://push.example/initiator"));
    savePushSubscription(recipient, subscription("https://push.example/phone"));
    savePushSubscription(recipient, subscription("https://push.example/tablet"));

    const result = checkItem(createItem(initiator), initiator)!;
    await sendShoppingSessionStartedNotification(initiator, result.sessionId!);

    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2);
    expect(webPushMock.sendNotification.mock.calls.map(([target]) => target.endpoint).sort()).toEqual([
      "https://push.example/phone",
      "https://push.example/tablet",
    ]);
    expect(webPushMock.sendNotification.mock.calls[0]?.[1]).toContain("Shopping in progress");
  });

  it("ignores later checks, categories, undo, and delivery errors for the push count", async () => {
    const initiator = createUser("initiator-2");
    const first = createItem(initiator, "first");
    const second = createItem(initiator, "second");
    const third = createItem(initiator, "third");
    const otherCategory = db.prepare("INSERT INTO categories (name, sort_order) VALUES ('Push-Test', 99)").run();
    db.prepare("UPDATE items SET category_id = ? WHERE id = ?").run(Number(otherCategory.lastInsertRowid), third);
    const recipient = createUser("recipient-2");
    savePushSubscription(recipient, subscription("https://push.example/good"));

    const firstResult = checkItem(first, initiator)!;
    await sendShoppingSessionStartedNotification(initiator, firstResult.sessionId!);
    checkItem(second, initiator);
    checkItem(third, recipient);
    undoCheckItem(first);
    checkItem(first, initiator);
    await sendShoppingSessionStartedNotification(initiator, firstResult.sessionId!);

    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT status FROM items WHERE id = ?").get(first)).toEqual({ status: "CHECKED" });
  });

  it("removes expired subscriptions and keeps other devices working", async () => {
    const initiator = createUser("initiator-3");
    const recipient = createUser("recipient-3");
    savePushSubscription(recipient, subscription("https://push.example/expired"));
    savePushSubscription(recipient, subscription("https://push.example/valid"));
    webPushMock.sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith("expired")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return {};
    });

    const result = checkItem(createItem(initiator), initiator)!;
    await sendShoppingSessionStartedNotification(initiator, result.sessionId!);

    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2);
    expect(listRecipientPushSubscriptions(initiator).map((row) => row.endpoint)).toEqual([
      "https://push.example/valid",
    ]);
  });

  it("does not fail the item action when VAPID is not configured", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const userId = createUser("no-vapid");
    expect(() => checkItem(createItem(userId), userId)).not.toThrow();
  });

  it("does not roll back a successful check when the provider fails", async () => {
    const initiator = createUser("provider-error");
    const recipient = createUser("provider-recipient");
    savePushSubscription(recipient, subscription("https://push.example/failing"));
    webPushMock.sendNotification.mockRejectedValue(new Error("provider unavailable"));

    const result = checkItem(createItem(initiator), initiator)!;
    await expect(
      sendShoppingSessionStartedNotification(initiator, result.sessionId!)
    ).resolves.toBeUndefined();
    expect(db.prepare("SELECT status FROM items WHERE id = (SELECT MAX(id) FROM items)").get()).toEqual({ status: "CHECKED" });
  });

  it("ends the session idempotently and replaces an expired session", () => {
    const userId = createUser("timeout-user");
    const first = createItem(userId, "timeout-first");
    checkItem(first, userId);
    db.prepare("UPDATE shopping_sessions SET last_activity_at = datetime('now', '-61 minutes')").run();
    const second = createItem(userId, "timeout-second");
    const result = checkItem(second, userId)!;

    expect(result.sessionStarted).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM shopping_sessions WHERE ended_at IS NULL").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM shopping_sessions").get()).toEqual({ count: 2 });
    expect(() => completeShopping(userId)).not.toThrow();
    expect(() => completeShopping(userId)).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM shopping_sessions WHERE ended_at IS NULL").get()).toEqual({ count: 0 });
  });
});
