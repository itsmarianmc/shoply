/// <reference lib="webworker" />
import { Serwist, NetworkOnly } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist: Serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, url }) => request.mode === "navigate" && ["/", "/list", "/archive"].includes(url.pathname),
      handler: async () => (await serwist.matchPrecache("/offline")) ?? new Response("Shoply is not ready offline yet. Connect and reopen the app.", { status: 503, headers: { "Content-Type": "text/plain" } }),
    },
    {
      matcher: ({ request, url }) => request.mode === "navigate" && url.origin === self.location.origin,
      handler: async ({ request }) => {
        try { return await fetch(request); }
        catch { return (await serwist.matchPrecache("/offline")) ?? new Response("Connect to open Shoply for the first time.", { status: 503 }); }
      },
    },
    // Precaching handles the versioned first-party shell/assets. Everything
    // else, including RSC, HTML, actions, images and APIs, is never cached.
    { matcher: () => true, handler: new NetworkOnly() },
  ],
});

serwist.addEventListeners();

const UPDATE_STATE_CACHE = "shoply-update-state";
const UPDATE_STATE_URL = new URL("/__shoply-update-intent__", self.location.origin).href;
let refreshingWindows = false;
async function refreshLegacyWindows(sourceId?: string) {
  if (refreshingWindows || self.registration.active?.state !== "activated") return;
  refreshingWindows = true;
  try {
    if (!await caches.has(UPDATE_STATE_CACHE)) return;
    if (!await (await caches.open(UPDATE_STATE_CACHE)).match(UPDATE_STATE_URL)) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.filter(client => client.id !== sourceId).map(client => client.navigate(client.url).catch(() => null)));
    await caches.delete(UPDATE_STATE_CACHE);
  } finally { refreshingWindows = false; }
}
self.addEventListener("message", event => {
  if (event.data?.type === "SHOPLY_ACTIVATE_UPDATE") event.waitUntil((async () => {
    try {
      // Workers can stop between message and activation; keep this generic
      // update intent durable. It contains no user/account information.
      await (await caches.open(UPDATE_STATE_CACHE)).put(UPDATE_STATE_URL, new Response("reload"));
      await self.skipWaiting();
    } catch { event.ports[0]?.postMessage({ error: "Could not prepare the update. Free browser storage and retry." }); }
  })());
  if (event.data?.type === "SHOPLY_OFFLINE_READY") event.waitUntil((async () => {
    event.ports[0]?.postMessage({ protocol: 1, ready: !!await serwist.matchPrecache("/offline") });
    // Navigation must run after activation finishes. The new shell's readiness
    // message supplies that foreground fallback, including on worker restart.
    await refreshLegacyWindows(event.source && "id" in event.source ? event.source.id : undefined);
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Retire runtime caches created by the previous generic-cache worker.
    const legacy = new Set(["google-fonts-webfonts", "google-fonts-stylesheets", "static-font-assets", "static-image-assets", "next-static-js-assets", "next-image", "static-audio-assets", "static-video-assets", "static-js-assets", "static-style-assets", "next-data", "static-data-assets", "apis", "pages-rsc-prefetch", "pages-rsc", "pages", "others", "cross-origin"]);
    for (const name of await caches.keys()) if (legacy.has(name)) await caches.delete(name);
  })());
});

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
      badge: "/icons/notification-badge.png",
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
