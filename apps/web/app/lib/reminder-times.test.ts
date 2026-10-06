import { describe, expect, it } from "vitest";
import {
  dayBeforeReminder,
  hasNewFutureReminders,
  localReminderTimeToUtc,
  reminderTimeToLocal,
  transactionReminderPayload,
} from "./reminder-times";

const now = Date.parse("2026-01-01T00:00:00.000Z");

describe("household reminder date/time conversion", () => {
  it("uses the household time zone instead of the browser's zone", () => {
    expect(localReminderTimeToUtc("2026-06-15T09:00", "America/Toronto"))
      .toBe("2026-06-15T13:00:00.000Z");
    expect(localReminderTimeToUtc("2026-01-15T09:00", "America/Toronto"))
      .toBe("2026-01-15T14:00:00.000Z");
  });

  it("handles midnight and discards milliseconds without introducing a 24-hour offset", () => {
    expect(localReminderTimeToUtc("2026-06-15T00:00", "UTC"))
      .toBe("2026-06-15T00:00:00.000Z");
    expect(reminderTimeToLocal("2026-06-15T00:00:00.789Z", "UTC"))
      .toBe("2026-06-15T00:00");
  });

  it("supports fractional-hour offsets and crossing a UTC date boundary", () => {
    expect(localReminderTimeToUtc("2026-06-15T00:15", "Asia/Kathmandu"))
      .toBe("2026-06-14T18:30:00.000Z");
  });

  it("rejects nonexistent wall times during spring-forward", () => {
    expect(() => localReminderTimeToUtc("2026-03-08T02:30", "America/Toronto"))
      .toThrow(expect.objectContaining({ code: "invalid" }));
  });

  it("chooses the earlier instant when a wall time repeats during fall-back", () => {
    expect(localReminderTimeToUtc("2026-11-01T01:30", "America/Toronto"))
      .toBe("2026-11-01T05:30:00.000Z");
  });

  it("rejects impossible calendar dates and incomplete values", () => {
    for (const input of ["", "2026-02-30T09:00", "2026-06-15T24:00", "2026-06-15T12:60"]) {
      expect(() => localReminderTimeToUtc(input, "UTC"))
        .toThrow(expect.objectContaining({ code: "invalid" }));
    }
  });
});

describe("transaction reminder choices", () => {
  it("makes the day-before preset a calendar subtraction at 9 AM", () => {
    expect(dayBeforeReminder("2026-03-09")).toBe("2026-03-08T09:00");
    expect(dayBeforeReminder("2026-01-01")).toBe("2025-12-31T09:00");
    expect(dayBeforeReminder("2028-03-01")).toBe("2028-02-29T09:00");
  });

  it("allows four distinct future reminders and rejects a fifth", () => {
    const times = ["2026-06-15T09:00", "2026-06-15T12:00", "2026-06-15T15:00", "2026-06-16T09:00"];
    expect(transactionReminderPayload(times, "UTC", [], now)).toHaveLength(4);
    expect(() => transactionReminderPayload([...times, "2026-06-17T09:00"], "UTC", [], now))
      .toThrow(expect.objectContaining({ code: "limit" }));
  });

  it("rejects duplicate and newly past choices", () => {
    expect(() => transactionReminderPayload(["2026-06-15T09:00", "2026-06-15T09:00"], "UTC", [], now))
      .toThrow(expect.objectContaining({ code: "duplicate" }));
    expect(() => transactionReminderPayload(["2025-12-31T09:00"], "UTC", [], now))
      .toThrow(expect.objectContaining({ code: "past" }));
  });

  it("preserves exact existing past instants and allows clearing them", () => {
    const existing = ["2025-12-31T09:00:43.123Z"];
    expect(transactionReminderPayload(["2025-12-31T09:00"], "UTC", existing, now)).toEqual(existing);
    expect(transactionReminderPayload([], "UTC", existing, now)).toEqual([]);
  });

  it("preserves an existing later occurrence of an ambiguous time", () => {
    const existing = ["2026-11-01T06:30:00.000Z"];
    expect(transactionReminderPayload(["2026-11-01T01:30"], "America/Toronto", existing, now)).toEqual(existing);
  });

  it("requests device setup only for newly selected future instants", () => {
    const existing = ["2026-06-15T09:00:00.000Z"];
    expect(hasNewFutureReminders(existing, existing, now)).toBe(false);
    expect(hasNewFutureReminders([], existing, now)).toBe(false);
    expect(hasNewFutureReminders(["2025-12-31T09:00:00.000Z"], [], now)).toBe(false);
    expect(hasNewFutureReminders(["2026-06-15T12:00:00.000Z"], existing, now)).toBe(true);
  });
});
