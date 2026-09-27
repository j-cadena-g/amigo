import { describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

const { buildNotificationPayload } = await import("./sender");

const event = (
  type: "add" | "purchase",
  actorName: string,
  itemName: string,
  actorUserId = actorName
) => ({ type, actorName, itemName, actorUserId, householdId: "hh", timestamp: 0 });

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
      buildNotificationPayload([event("add", "Ana", "pan"), event("purchase", "Ana", "arroz")], "es")
        .body
    ).toBe("Ana actualizó la lista de compras");
    expect(buildNotificationPayload([event("add", "", "pan")], "es").body).toBe(
      "Alguien agregó pan a la lista"
    );
  });
});
