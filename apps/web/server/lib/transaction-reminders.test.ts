import { describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
const { transactionReminderTtl, buildTransactionReminderPayload } = await import(
  "./transaction-reminders"
);

describe("transaction reminder deadlines", () => {
  const scheduled = "2026-10-03T09:00:00.000Z";

  it.each([
    ["2026-10-03T08:59:59.000Z", null],
    ["2026-10-03T09:00:00.000Z", 10800],
    ["2026-10-03T10:00:00.000Z", 7200],
    ["2026-10-03T11:59:59.000Z", 1],
    ["2026-10-03T11:59:59.500Z", null],
    ["2026-10-03T12:00:00.000Z", null],
    ["2026-10-04T09:00:00.000Z", null],
  ])("bounds delivery and provider TTL at %s", (now, expected) => {
    expect(transactionReminderTtl(scheduled, new Date(now))).toBe(expected);
  });

  it("ignores invalid stored timestamps", () => {
    expect(transactionReminderTtl("invalid", new Date(scheduled))).toBeNull();
  });
});

describe("transaction reminder copy", () => {
  it("identifies the transaction and retains one stable tag per selected time", () => {
    const transaction = { id: "bill", description: "Phone bill", category: "Utilities" };
    const first = buildTransactionReminderPayload(transaction, "2026-10-03T09:00:00.000Z", "en");
    expect(first).toMatchObject({
      title: "Transaction reminder",
      body: "Reminder: Phone bill",
      data: { url: "/financial", type: "transaction-reminder" },
    });
    const second = buildTransactionReminderPayload(transaction, "2026-10-04T09:00:00.000Z", "en");
    expect(first.tag).not.toBe(second.tag);
    expect(buildTransactionReminderPayload(transaction, "2026-10-03T09:00:00.000Z", "en").tag).toBe(
      first.tag
    );
  });

  it("uses Spanish and falls back to the category for a blank description", () => {
    expect(
      buildTransactionReminderPayload(
        { id: "bill", description: " ", category: "Servicios" },
        "2026-10-03T09:00:00.000Z",
        "es"
      )
    ).toMatchObject({
      title: "Recordatorio de transacción",
      body: "Recordatorio: Servicios",
    });
  });
});
