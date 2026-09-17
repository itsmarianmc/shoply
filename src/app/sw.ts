/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

interface ShoppingPushPayload {
  type: string;
  title: string;
  body: string;
  url: string;
  sessionId?: number;
}

const defaultPushPayload: ShoppingPushPayload = {
  type: "shopping-session-started",
  title: "Shoply",
  body: "There is new activity on your shopping list.",
  url: "/list",
};

function parsePushPayload(data: PushMessageData | null): ShoppingPushPayload {
  if (!data) return defaultPushPayload;
  try {
    const value = data.json() as Partial<ShoppingPushPayload>;
    if (
      typeof value.title !== "string" ||
      typeof value.body !== "string" ||
      typeof value.url !== "string"
    ) {
      return defaultPushPayload;
    }
    const url = value.url.startsWith("/") ? value.url : "/list";
    return {
      type: typeof value.type === "string" ? value.type : "shopping-session-started",
      title: value.title.slice(0, 100),
      body: value.body.slice(0, 500),
      url,
      ...(typeof value.sessionId === "number" ? { sessionId: value.sessionId } : {}),
    };
  } catch {
    return defaultPushPayload;
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event.data);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { type: payload.type, url: payload.url, sessionId: payload.sessionId },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    typeof event.notification.data?.url === "string" &&
    event.notification.data.url.startsWith("/")
      ? event.notification.data.url
      : "/list";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windowClients.find((client) => "focus" in client);
      if (existing) {
        if ("navigate" in existing && !existing.url.endsWith(targetUrl)) {
          await existing.navigate(targetUrl);
        }
        await existing.focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
