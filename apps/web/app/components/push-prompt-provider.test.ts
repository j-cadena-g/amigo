import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPushPromptPath, shouldOfferGroceryNotifications } from "./push-prompt-provider";
import {
  getNotificationPermissionStatus,
  getNotificationPreferences,
  hasPushRegistration,
  isSubscribed,
} from "@/app/lib/push/client";

vi.mock("@/app/lib/push/client", () => ({
  getNotificationPermissionStatus: vi.fn(),
  getNotificationPreferences: vi.fn(),
  hasPushRegistration: vi.fn(),
  isSubscribed: vi.fn(),
}));

describe("isPushPromptPath", () => {
  it("prompts on the grocery list", () => {
    expect(isPushPromptPath("/groceries")).toBe(true);
    expect(isPushPromptPath("/groceries/")).toBe(true);
  });

  it("does not prompt anywhere else", () => {
    expect(isPushPromptPath("/dashboard")).toBe(false);
    expect(isPushPromptPath("/settings")).toBe(false);
    expect(isPushPromptPath("/financial")).toBe(false);
    expect(isPushPromptPath("/")).toBe(false);
  });

  it("does not match paths that only share the prefix", () => {
    expect(isPushPromptPath("/groceries-archive")).toBe(false);
  });
});

describe("grocery prompt eligibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getNotificationPermissionStatus).mockReturnValue("granted");
    vi.mocked(hasPushRegistration).mockResolvedValue(true);
    vi.mocked(isSubscribed).mockResolvedValue(false);
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      groceryNotifications: true,
      recurringNotifications: false,
      transactionNotifications: true,
    });
  });

  it("offers grocery device setup when groceries are enabled and this device is unsubscribed", async () => {
    await expect(shouldOfferGroceryNotifications()).resolves.toBe(true);
  });

  it("does not prompt after an account-wide grocery opt-out, even with recurring reminders enabled", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      groceryNotifications: false,
      recurringNotifications: true,
      transactionNotifications: true,
    });
    await expect(shouldOfferGroceryNotifications()).resolves.toBe(false);
  });

  it("does not prompt on a subscribed grocery device", async () => {
    vi.mocked(isSubscribed).mockResolvedValue(true);
    await expect(shouldOfferGroceryNotifications()).resolves.toBe(false);
  });

  it("does not offer device setup when browser permission is blocked", async () => {
    vi.mocked(getNotificationPermissionStatus).mockReturnValue("denied");
    await expect(shouldOfferGroceryNotifications()).resolves.toBe(false);
    expect(getNotificationPreferences).not.toHaveBeenCalled();
  });
});
