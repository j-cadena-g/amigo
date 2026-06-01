/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    type?: string;
  };
}

function parsePushPayload(data: PushMessageData | null): PushPayload | null {
  if (!data) return null;

  let raw: unknown;
  try {
    raw = data.json();
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.body !== "string") {
    return null;
  }

  const payload: PushPayload = {
    title: record.title,
    body: record.body,
  };

  if (typeof record.icon === "string") payload.icon = record.icon;
  if (typeof record.badge === "string") payload.badge = record.badge;
  if (typeof record.tag === "string") payload.tag = record.tag;

  if (typeof record.data === "object" && record.data !== null) {
    const dataRecord = record.data as Record<string, unknown>;
    payload.data = {};
    if (typeof dataRecord.url === "string") payload.data.url = dataRecord.url;
    if (typeof dataRecord.type === "string") payload.data.type = dataRecord.type;
  }

  return payload;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      const payload = parsePushPayload(event.data);
      if (!payload) {
        console.error("Push notification error: invalid payload");
        return;
      }

      try {
        const options: NotificationOptions = {
          body: payload.body,
          icon: payload.icon ?? "/icon-192.png",
          badge: payload.badge ?? "/icon-192.png",
          tag: payload.tag,
          data: payload.data,
          requireInteraction: false,
        };
        await self.registration.showNotification(payload.title, options);
      } catch (error) {
        console.error("Push notification error:", error);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const rawUrl =
    (event.notification.data as { url?: string } | undefined)?.url ??
    "/groceries";

  const url = (() => {
    try {
      const parsed = new URL(rawUrl, self.location.origin);
      return parsed.origin === self.location.origin
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : "/groceries";
    } catch {
      return "/groceries";
    }
  })();

  event.waitUntil(
    (async () => {
      try {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        for (const client of windowClients) {
          if ("focus" in client) {
            await client.focus();
            if ("navigate" in client) {
              await (client as WindowClient).navigate(url);
            }
            return;
          }
        }

        await self.clients.openWindow(url);
      } catch (err) {
        console.error("notificationclick handler failed", {
          err,
          data: event.notification.data,
          url,
        });
      }
    })()
  );
});

self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag === "sync-groceries") {
    syncEvent.waitUntil(notifyClientsToSync());
  }
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SYNC_NOW") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "TRIGGER_SYNC" });
  }
}
