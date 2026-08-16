import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasPushRegistration,
  isSubscribed,
  pushSubscriptionKeysMissing,
  subscribeToPush,
  unsubscribeFromPush,
} from "./client";

const VAPID_PUBLIC_KEY = "dGVzdA";

function stubPushEnvironment({
  registration,
  ready = new Promise<ServiceWorkerRegistration>(() => undefined),
}: {
  registration: Partial<ServiceWorkerRegistration> | undefined;
  ready?: Promise<ServiceWorkerRegistration>;
}) {
  const NotificationMock = {
    permission: "granted" as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };

  vi.stubGlobal("Notification", NotificationMock);
  vi.stubGlobal("window", {
    Notification: NotificationMock,
    PushManager: function PushManager() {},
    atob: globalThis.atob.bind(globalThis),
    btoa: globalThis.btoa.bind(globalThis),
  });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready,
    },
  });
}

describe("push registration availability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("isSubscribed is false when no service worker is registered", async () => {
    stubPushEnvironment({ registration: undefined });

    await expect(isSubscribed()).resolves.toBe(false);
  });

  it("hasPushRegistration is false when no service worker is registered", async () => {
    stubPushEnvironment({ registration: undefined });

    await expect(hasPushRegistration()).resolves.toBe(false);
  });

  it("subscribeToPush rejects promptly when no registration exists", async () => {
    stubPushEnvironment({ registration: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(subscribeToPush()).rejects.toThrow(
      "Service worker is not available"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unsubscribeFromPush resolves without calling the server when no registration exists", async () => {
    stubPushEnvironment({ registration: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("subscribeToPush waits for an active worker before calling pushManager.subscribe", async () => {
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
      getKey: vi.fn(() => new ArrayBuffer(8)),
    });
    const inactiveRegistration = {
      active: null,
      pushManager: {
        getSubscription: vi.fn(),
        subscribe: vi.fn(),
      },
    };
    const activeRegistration = {
      active: {} as ServiceWorker,
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe,
      },
    } as unknown as ServiceWorkerRegistration;

    stubPushEnvironment({
      registration: inactiveRegistration as unknown as ServiceWorkerRegistration,
      ready: Promise.resolve(activeRegistration),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/push/status")) {
          return Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
        }
        return Response.json({ success: true });
      })
    );

    await subscribeToPush();

    expect(inactiveRegistration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("pushSubscriptionKeysMissing", () => {
  it("is true when either crypto key is missing", () => {
    expect(pushSubscriptionKeysMissing(null, new ArrayBuffer(8))).toBe(true);
    expect(pushSubscriptionKeysMissing(new ArrayBuffer(8), null)).toBe(true);
    expect(pushSubscriptionKeysMissing(null, null)).toBe(true);
  });

  it("is false when both keys are present", () => {
    expect(
      pushSubscriptionKeysMissing(new ArrayBuffer(8), new ArrayBuffer(8))
    ).toBe(false);
  });
});
