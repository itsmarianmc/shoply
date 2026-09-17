"use server";

import { requireUser } from "@/lib/auth";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/push-subscriptions";
import { sendTestPushNotification } from "@/lib/push";

export async function registerPushSubscriptionAction(
  subscription: unknown
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  try {
    savePushSubscription(user.id, subscription);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Push subscription could not be saved.",
    };
  }
}

export async function deletePushSubscriptionAction(
  endpoint: unknown
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  try {
    deletePushSubscription(user.id, endpoint);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Push subscription could not be deleted.",
    };
  }
}

export async function sendTestPushNotificationAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await requireUser();
  try {
    const result = await sendTestPushNotification(user.id);
    if (!result.configured) {
      return {
        success: false,
        error: "Push notifications are not configured on the server.",
      };
    }
    if (result.attempted === 0) {
      return {
        success: false,
        error: "No push subscription is registered for this user.",
      };
    }
    if (result.sent === 0) {
      return {
        success: false,
        error: "The test notification could not be delivered to any device.",
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "The test notification could not be sent.",
    };
  }
}
