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

export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  const registration = await navigator.serviceWorker.ready;
  const { vapidPublicKey } = await fetchPushConfig();

  if (!vapidPublicKey) {
    throw new Error("Push notifications are not configured on this server");
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const p256dhKey = subscription.getKey("p256dh");
  const authKey = subscription.getKey("auth");

  if (!p256dhKey || !authKey) {
    throw new Error("Failed to get subscription keys");
  }

  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(p256dhKey),
        auth: arrayBufferToBase64(authKey),
      },
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to save subscription");
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
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
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
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
