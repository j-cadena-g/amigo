import { afterEach, describe, expect, it, vi } from "vitest";
import { isSubscribed, pushSubscriptionKeysMissing } from "./client";

describe("isSubscribed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when no service worker is registered", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(undefined),
        ready: new Promise(() => undefined),
      },
    });

    await expect(isSubscribed()).resolves.toBe(false);
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
