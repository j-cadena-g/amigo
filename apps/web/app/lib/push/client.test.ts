import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPreferences,
  hasPushRegistration,
  isSubscribed,
  pushSubscriptionKeysMissing,
  setNotificationCategory,
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreferences,
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

describe("notification categories", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function existingSubscription() {
    const subscription = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
      getKey: vi.fn(() => new ArrayBuffer(8)),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    stubPushEnvironment({
      registration: {
        active: {} as ServiceWorker,
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscription),
          subscribe: vi.fn(),
        } as unknown as PushManager,
      },
    });
    return subscription;
  }

  it("loads account-wide category choices", async () => {
    const preferences = { groceryNotifications: false, recurringNotifications: true, transactionNotifications: true };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(preferences));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNotificationPreferences()).resolves.toEqual(preferences);
    expect(fetchMock).toHaveBeenCalledWith("/api/push/preferences");
  });

  it.each(["groceryNotifications", "recurringNotifications", "transactionNotifications"] as const)(
    "turning %s off does not remove the device subscription or change the other category",
    async (category) => {
      const subscription = existingSubscription();
      const fetchMock = vi.fn().mockResolvedValue(Response.json({
        groceryNotifications: category !== "groceryNotifications",
        recurringNotifications: category !== "recurringNotifications",
        transactionNotifications: category !== "transactionNotifications",
      }));
      vi.stubGlobal("fetch", fetchMock);

      await setNotificationCategory(category, false);

      expect(subscription.unsubscribe).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [category]: false }),
      });
    }
  );

  it.each(["recurringNotifications", "transactionNotifications"] as const)(
    "enabling %s leaves the other categories unchanged", async (category) => {
      const subscription = existingSubscription();
      const preferences = {
        groceryNotifications: false,
        recurringNotifications: category === "recurringNotifications",
        transactionNotifications: category === "transactionNotifications",
      };
      const fetchMock = vi.fn(async (url: string) => {
        if (url === "/api/push/status") return Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
        if (url === "/api/push") return Response.json({ success: true });
        return Response.json(preferences);
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(setNotificationCategory(category, true)).resolves.toEqual(preferences);

      expect(fetchMock).toHaveBeenLastCalledWith("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [category]: true }),
      });
      expect(subscription.unsubscribe).not.toHaveBeenCalled();
    }
  );

  it("does not enable a category when device subscription fails", async () => {
    stubPushEnvironment({ registration: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(setNotificationCategory("recurringNotifications", true)).rejects.toThrow(
      "Service worker is not available"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed preference save without removing an existing subscription", async () => {
    const subscription = existingSubscription();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(setNotificationCategory("groceryNotifications", false)).rejects.toMatchObject({ code: "failed" });
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("does not report success when loading or saving preferences fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 500 }))));

    await expect(getNotificationPreferences()).rejects.toMatchObject({ code: "failed" });
    await expect(updateNotificationPreferences({ recurringNotifications: true, transactionNotifications: true })).rejects.toMatchObject({ code: "failed" });
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
