"use client";

import { useEffect, useState } from "react";
import {
  deletePushSubscriptionAction,
  registerPushSubscriptionAction,
  sendTestPushNotificationAction,
} from "@/app/push/actions";

interface Props {
  vapidPublicKey: string | null;
}

type State = "loading" | "unsupported" | "inactive" | "active" | "busy" | "error";

function base64UrlToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function canUsePush(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export default function PushNotificationControl({ vapidPublicKey }: Props) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success">("success");
  const [isTestBusy, setIsTestBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      if (!canUsePush()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (!vapidPublicKey) {
        if (!cancelled) {
          setState("error");
          setMessage("Push notifications are not configured on the server.");
        }
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setState(subscription ? "active" : "inactive");
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Push notifications could not be checked.");
        }
      }
    }
    void loadStatus();
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  async function enable() {
    setMessage(null);
    setMessageKind("success");
    if (!canUsePush()) {
      setState("unsupported");
      return;
    }
    if (!vapidPublicKey) {
      setState("error");
      setMessage("Push notifications are not configured on the server.");
      return;
    }

    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("error");
        setMessageKind("error");
        setMessage("Please allow notifications in your browser settings.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidPublicKey),
      });
      const result = await registerPushSubscriptionAction(subscription.toJSON());
      if (!result.success) throw new Error(result.error);
      setState("active");
      setMessageKind("success");
      setMessage("Notifications are enabled.");
    } catch (error) {
      setState("error");
      setMessageKind("error");
      setMessage(error instanceof Error && error.message
        ? error.message
        : "Notifications could not be enabled.");
    }
  }

  async function disable() {
    setMessage(null);
    setMessageKind("success");
    setState("busy");
    try {
      if (!canUsePush()) {
        setState("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        const localResult = await subscription.unsubscribe();
        if (!localResult) throw new Error("The local subscription could not be unsubscribed.");
        const result = await deletePushSubscriptionAction(endpoint);
        if (!result.success) throw new Error(result.error);
      }
      setState("inactive");
      setMessageKind("success");
      setMessage("Notifications are disabled.");
    } catch (error) {
      setState("error");
      setMessageKind("error");
      setMessage(error instanceof Error && error.message
        ? error.message
        : "Notifications could not be disabled.");
    }
  }

  async function sendTestNotification() {
    setIsTestBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPushNotificationAction();
      if (!result.success) throw new Error(result.error);
      setMessageKind("success");
      setMessage("The test notification was sent.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error && error.message
        ? error.message
        : "The test notification could not be sent.");
    } finally {
      setIsTestBusy(false);
    }
  }

  if (state === "loading") return null;
  if (state === "unsupported") {
    return (
      <section className="spl-card" aria-labelledby="push-settings-title">
        <div className="spl-card-header">
          <span className="spl-card-icon"><i className="fa-solid fa-bell-slash" aria-hidden="true" /></span>
          <h1 id="push-settings-title" className="spl-card-title">Notifications</h1>
        </div>
        <div className="spl-push-control" role="status">
          <span className="spl-hint">Push notifications are not supported by this browser.</span>
        </div>
      </section>
    );
  }

  const isBusy = state === "busy" || isTestBusy;
  const active = state === "active";
  return (
    <section className="spl-card" aria-labelledby="push-settings-title">
      <div className="spl-card-header">
        <span className="spl-card-icon"><i className="fa-solid fa-bell" aria-hidden="true" /></span>
        <h1 id="push-settings-title" className="spl-card-title">Notifications</h1>
      </div>
      <p className="spl-card-note">
        Receive a notification when another household member starts shopping.
        You can remove the permission at any time.
      </p>
      <div className="spl-push-control" role="group" aria-label="Push notifications">
        <div className="spl-push-actions">
          <button
            type="button"
            className="spl-btn spl-btn-secondary spl-btn-sm"
            onClick={() => void (active ? disable() : enable())}
            disabled={isBusy || !vapidPublicKey}
          >
            <i className={`fa-solid ${active ? "fa-bell-slash" : "fa-bell"}`} aria-hidden="true" />
            {state === "busy" ? "Updating…" : active ? "Disable notifications" : "Enable notifications"}
          </button>
          {active && (
            <button
              type="button"
              className="spl-btn spl-btn-secondary spl-btn-sm"
              onClick={() => void sendTestNotification()}
              disabled={isBusy}
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              {isTestBusy ? "Sending…" : "Send test notification"}
            </button>
          )}
        </div>
        {message && (
          <span className={messageKind === "error" ? "spl-error" : "spl-hint"} role={messageKind === "error" ? "alert" : "status"}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
