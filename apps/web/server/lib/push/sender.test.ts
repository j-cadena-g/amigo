import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import type { DrizzleD1, PushSubscription } from "@amigo/db";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

const { buildNotificationPayload, ensureVapidConfigured, sendPushNotification } = await import(
  "./sender"
);

const event = (
  type: "add" | "purchase",
  actorName: string,
  itemName: string,
  actorUserId = actorName
) => ({
  type,
  actorName,
  itemName,
  actorUserId,
  householdId: "hh",
  timestamp: 0,
});

describe("buildNotificationPayload", () => {
  it("keeps the English wording", () => {
    const payload = buildNotificationPayload([event("add", "Ana", "leche")]);
    expect(payload.title).toBe("Grocery List Update");
    expect(payload.body).toBe("Ana added leche to the list");
  });

  it("writes Spanish, with plural verbs for several people", () => {
    expect(buildNotificationPayload([event("add", "Ana", "leche")], "es").body).toBe(
      "Ana agregó leche a la lista"
    );
    expect(
      buildNotificationPayload(
        [event("purchase", "Ana", "pan"), event("purchase", "Luis", "arroz")],
        "es"
      ).body
    ).toBe("Ana y Luis compraron 2 artículos");
    expect(buildNotificationPayload([event("purchase", "Ana", "leche")], "es").body).toBe(
      "Ana compró leche"
    );
    expect(
      buildNotificationPayload(
        [event("add", "Ana", "pan"), event("purchase", "Ana", "arroz")],
        "es"
      ).body
    ).toBe("Ana actualizó la lista de compras");
    expect(buildNotificationPayload([event("add", "", "pan")], "es").body).toBe(
      "Alguien agregó pan a la lista"
    );
  });
});

describe("push transport outcomes", () => {
  const subscription = {
    id: "device",
    endpoint: "https://push.example/device",
    keys: { auth: "auth", p256dh: "key" },
  } as PushSubscription;
  const payload = { title: "Reminder", body: "Tomorrow" };
  const updateWhere = vi.fn();
  const deleteWhere = vi.fn();
  const db = {
    update: () => ({ set: () => ({ where: updateWhere }) }),
    delete: () => ({ where: deleteWhere }),
  } as unknown as DrizzleD1;

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset();
    updateWhere.mockReset().mockResolvedValue(undefined);
    deleteWhere.mockReset().mockResolvedValue(undefined);
  });

  it("returns sent after success and forwards reminder TTL", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({
      statusCode: 201,
      body: "",
      headers: {},
    });
    expect(await sendPushNotification(db, subscription, payload, { TTL: 100 })).toBe("sent");
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { timeout: 30_000, TTL: 100 }
    );
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it.each([404, 410])("returns gone and deletes an expired %i subscription", async (statusCode) => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode });
    expect(await sendPushNotification(db, subscription, payload)).toBe("gone");
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("leaves transient failures retryable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 503 });
    expect(await sendPushNotification(db, subscription, payload)).toBe("failed");
    expect(deleteWhere).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps successful delivery successful when timestamp bookkeeping fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(webpush.sendNotification).mockResolvedValue({
      statusCode: 201,
      body: "",
      headers: {},
    });
    updateWhere.mockRejectedValueOnce(new Error("D1 unavailable"));
    expect(await sendPushNotification(db, subscription, payload)).toBe("sent");
    log.mockRestore();
  });

  it("rechecks missing VAPID even after an earlier configuration", () => {
    expect(
      ensureVapidConfigured({
        VAPID_SUBJECT: "mailto:test@example.com",
        VAPID_PUBLIC_KEY: "public",
        VAPID_PRIVATE_KEY: "private",
      } as never)
    ).toBe(true);
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ensureVapidConfigured({} as never)).toBe(false);
    log.mockRestore();
  });
});
