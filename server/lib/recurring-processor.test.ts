import { describe, expect, it, vi } from "vitest";
import {
  buildRecurringOccurrenceTransactionId,
  calculateNextRunDate,
  getInitialNextRunDate,
  isSqlitePrimaryKeyConflict,
} from "./recurring-processor";

describe("recurring-processor", () => {
  it("buildRecurringOccurrenceTransactionId is deterministic", () => {
    expect(buildRecurringOccurrenceTransactionId("rule-1", "2026-01-15")).toBe(
      "recurring:rule-1:2026-01-15"
    );
  });

  it("isSqlitePrimaryKeyConflict detects transaction id conflicts", () => {
    expect(
      isSqlitePrimaryKeyConflict(
        new Error("UNIQUE constraint failed: transactions.id")
      )
    ).toBe(true);
    expect(
      isSqlitePrimaryKeyConflict(
        new Error("PRIMARY KEY constraint failed: transactions.id")
      )
    ).toBe(true);
    expect(isSqlitePrimaryKeyConflict(new Error("other"))).toBe(false);
  });

  it("calculateNextRunDate advances DAILY in UTC", () => {
    const from = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const next = calculateNextRunDate("DAILY", 1, from);
    expect(next.toISOString()).toBe("2026-01-16T12:00:00.000Z");
  });

  it("calculateNextRunDate advances WEEKLY in UTC", () => {
    const from = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const next = calculateNextRunDate("WEEKLY", 1, from);
    expect(next.toISOString()).toBe("2026-01-22T12:00:00.000Z");
  });

  it("calculateNextRunDate advances YEARLY in UTC", () => {
    const from = new Date(Date.UTC(2026, 5, 10, 0, 0, 0));
    const next = calculateNextRunDate("YEARLY", 1, from);
    expect(next.toISOString()).toBe("2027-06-10T00:00:00.000Z");
  });

  it("calculateNextRunDate advances MONTHLY in UTC", () => {
    const from = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const next = calculateNextRunDate("MONTHLY", 1, from);
    expect(next.toISOString()).toBe("2026-02-15T12:00:00.000Z");
  });

  it("calculateNextRunDate clamps MONTHLY day to last day of short month", () => {
    const from = new Date(Date.UTC(2026, 0, 31, 0, 0, 0));
    const next = calculateNextRunDate("MONTHLY", 1, from, 31);
    expect(next.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("getInitialNextRunDate bulk-advances old DAILY starts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15, 15, 0, 0)));
    try {
      const start = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));
      const next = getInitialNextRunDate(start, "DAILY", 1);
      expect(next).not.toBeNull();
      expect((next as Date).toISOString().slice(0, 10)).toBe("2026-06-15");
    } finally {
      vi.useRealTimers();
    }
  });

  it("getInitialNextRunDate rejects non-positive interval", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    expect(() =>
      getInitialNextRunDate(start, "DAILY", 0)
    ).toThrow(/Invalid recurring interval/);
    expect(() =>
      getInitialNextRunDate(start, "DAILY", Number.NaN)
    ).toThrow(/Invalid recurring interval/);
  });
});
