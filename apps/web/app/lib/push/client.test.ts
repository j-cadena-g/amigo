import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPreferences,
  hasPushRegistration,
  isSubscribed,
  pushSubscriptionKeysMissing,
  enableReminderNotifications,
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

describe("enableReminderNotifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function savedPreferences(category: "recurringNotifications" | "transactionNotifications") {
    return {
      groceryNotifications: false,
      recurringNotifications: category === "recurringNotifications",
      transactionNotifications: category === "transactionNotifications",
    };
  }

  it.each(["recurringNotifications", "transactionNotifications"] as const)(
    "returns null when device setup and the %s preference both succeed",
    async (category) => {
      existingSubscription();
      const fetchMock = vi.fn(async (url: string) => {
        if (url === "/api/push/status") return Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
        if (url === "/api/push") return Response.json({ success: true });
        return Response.json(savedPreferences(category));
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(enableReminderNotifications(category)).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledWith("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [category]: true }),
      });
    }
  );

  it("returns denied when permission is denied and still saves the preference", async () => {
    stubPushEnvironment({ registration: undefined });
    vi.stubGlobal("Notification", {
      permission: "default" as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    const fetchMock = vi.fn().mockResolvedValue(Response.json(savedPreferences("transactionNotifications")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(enableReminderNotifications("transactionNotifications")).resolves.toEqual({
      step: "device",
      code: "denied",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionNotifications: true }),
    });
  });

  it("reports a preference failure when the device subscribes but the preference save fails", async () => {
    existingSubscription();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/push/status") return Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
      if (url === "/api/push/preferences") return new Response(null, { status: 500 });
      return Response.json({ success: true });
    }));

    await expect(enableReminderNotifications("recurringNotifications")).resolves.toEqual({
      step: "preference",
      code: "failed",
    });
  });

  it("never rejects when device setup and the preference save both fail", async () => {
    stubPushEnvironment({ registration: undefined });
    vi.stubGlobal("Notification", {
      permission: "default" as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(enableReminderNotifications("recurringNotifications")).resolves.toEqual({
      step: "preference",
      code: "failed",
    });
  });

  it("leaves a device turned off in settings alone until it is turned back on", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
    // Like a browser: unsubscribing ends the subscription, and subscribe() makes a new one.
    let current: PushSubscription | null = null;
    const makeSubscription = (endpoint: string) => {
      const subscription = {
        endpoint,
        getKey: vi.fn(() => new ArrayBuffer(8)),
        unsubscribe: vi.fn(async () => {
          current = null;
          return true;
        }),
      } as unknown as PushSubscription;
      current = subscription;
      return subscription;
    };
    const original = makeSubscription("https://updates.push.services.mozilla.com/wpush/v2/old");
    const pushManager = {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => makeSubscription("https://updates.push.services.mozilla.com/wpush/v2/new")),
    };
    stubPushEnvironment({
      registration: { active: {} as ServiceWorker, pushManager: pushManager as unknown as PushManager },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/push/status") return Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
      if (url === "/api/push/preferences") return Response.json(savedPreferences("recurringNotifications"));
      return Response.json({ success: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await unsubscribeFromPush();
    expect(original.unsubscribe).toHaveBeenCalledOnce();
    fetchMock.mockClear();

    await expect(enableReminderNotifications("recurringNotifications")).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/push/preferences"]);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();

    // Turning the device back on subscribes it again, and reminder setup then keeps it registered.
    await subscribeToPush();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    fetchMock.mockClear();
    await expect(enableReminderNotifications("recurringNotifications")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/push", expect.objectContaining({ method: "POST" }));
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
