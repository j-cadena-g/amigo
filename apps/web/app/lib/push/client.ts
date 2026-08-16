export type NotificationPermissionStatus =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export function getNotificationPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";

  return Notification.permission;
}

export function isPWAInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua);
}

async function fetchPushConfig(): Promise<{ vapidPublicKey: string | null }> {
  const res = await fetch("/api/push/status");
  if (!res.ok) {
    throw new Error("Failed to load push configuration");
  }
  return res.json() as Promise<{ vapidPublicKey: string | null }>;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function hasPushRegistration(): Promise<boolean> {
  return (await getPushRegistration()) !== null;
}

async function getActivePushRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await getPushRegistration();
  if (!registration) return null;
  if (registration.active) return registration;
  return navigator.serviceWorker.ready;
}

export async function subscribeToPush(): Promise<void> {
  if (getNotificationPermissionStatus() === "unsupported") {
    throw new Error("Push notifications are not supported in this browser");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  const registration = await getActivePushRegistration();
  if (!registration) {
    throw new Error("Service worker is not available");
  }
  const { vapidPublicKey } = await fetchPushConfig();

  if (!vapidPublicKey) {
    throw new Error("Push notifications are not configured on this server");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const p256dhKey = subscription.getKey("p256dh");
  const authKey = subscription.getKey("auth");

  if (pushSubscriptionKeysMissing(p256dhKey, authKey)) {
    // Drop invalid subscriptions (new or existing) so retries can recreate them.
    await subscription.unsubscribe().catch(() => undefined);
    throw new Error("Failed to get subscription keys");
  }

  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(p256dhKey as ArrayBuffer),
        auth: arrayBufferToBase64(authKey as ArrayBuffer),
      },
    }),
  });

  if (!res.ok) {
    if (!existingSubscription) {
      await subscription.unsubscribe().catch(() => undefined);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to save subscription");
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await getPushRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  let res: Response;
  try {
    res = await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `Failed to remove subscription: ${err.message}`
        : "Failed to remove subscription";
    throw new Error(message, { cause: err });
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      data.error ?? `Failed to remove subscription (${res.status})`
    );
  }

  await subscription.unsubscribe();
}

export async function isSubscribed(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const registration = await getPushRegistration();
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/** True when a PushSubscription cannot be persisted (missing crypto keys). */
export function pushSubscriptionKeysMissing(
  p256dh: ArrayBuffer | null,
  auth: ArrayBuffer | null
): boolean {
  return p256dh == null || auth == null;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return window.btoa(binary);
}
