import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { getVapidConfig } from "./push-config";
import {
  listRecipientPushSubscriptions,
  listUserPushSubscriptions,
  markPushSubscriptionFailure,
  markPushSubscriptionSuccess,
  removePushSubscriptionById,
} from "./push-subscriptions";

interface PushPayloadBase {
  title: string;
  body: string;
  url: "/list" | "/settings";
}

export interface ShoppingSessionStartedPayload extends PushPayloadBase {
  type: "shopping-session-started";
  url: "/list";
  sessionId: number;
}

interface TestPushPayload extends PushPayloadBase {
  type: "push-test";
  url: "/settings";
}

interface PushDeliveryResult {
  configured: boolean;
  attempted: number;
  sent: number;
}

async function sendPayloadToSubscriptions(
  subscriptions: ReturnType<typeof listRecipientPushSubscriptions>,
  payload: PushPayloadBase & { type: string }
): Promise<PushDeliveryResult> {
  const config = getVapidConfig();
  if (!config) return { configured: false, attempted: 0, sent: 0 };

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const target = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      };
      try {
        await webpush.sendNotification(target, JSON.stringify(payload));
        markPushSubscriptionSuccess(subscription.id);
        sent += 1;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? (error as { statusCode?: unknown }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          removePushSubscriptionById(subscription.id);
        } else {
          markPushSubscriptionFailure(subscription.id, error);
          console.error("Web Push delivery failed", { subscriptionId: subscription.id });
        }
      }
    })
  );

  return { configured: true, attempted: subscriptions.length, sent };
}

export async function sendShoppingSessionStartedNotification(
  startedByUserId: number,
  sessionId: number
): Promise<void> {
  const sender = db
    .prepare("SELECT name FROM users WHERE id = ?")
    .get(startedByUserId) as { name: string } | undefined;
  if (!sender) return;

  const payload: ShoppingSessionStartedPayload = {
    type: "shopping-session-started",
    title: "Shopping in progress",
    body: `${sender.name} is shopping right now – think of anything else? Add it to the list now.`,
    url: "/list",
    sessionId,
  };

  await sendPayloadToSubscriptions(
    listRecipientPushSubscriptions(startedByUserId),
    payload
  );
}

export async function sendTestPushNotification(
  userId: number
): Promise<PushDeliveryResult> {
  const payload: TestPushPayload = {
    type: "push-test",
    title: "Shoply test notification",
    body: "Push notifications are working on this device.",
    url: "/settings",
  };
  return sendPayloadToSubscriptions(listUserPushSubscriptions(userId), payload);
}
