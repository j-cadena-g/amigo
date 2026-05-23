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

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      try {
        const payload = event.data!.json() as PushPayload;
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

  const url =
    (event.notification.data as { url?: string } | undefined)?.url ??
    "/groceries";

  event.waitUntil(
    (async () => {
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
    void notifyClientsToSync();
  }
});

async function notifyClientsToSync(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "TRIGGER_SYNC" });
  }
}
