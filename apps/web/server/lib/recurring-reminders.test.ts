import { describe, expect, it, vi } from "vitest";
import type { RecurringRule } from "./recurring-processor";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
const {
  buildRecurringReminderPayload,
  occursOnDate,
  dueRecurringReminders,
  recurringReminderTimeToUtc,
} = await import("./recurring-reminders");

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "rule",
    active: true,
    deletedAt: null,
    type: "expense",
    startDate: "2026-01-01",
    endDate: null,
    nextRunDate: "2026-10-04",
    frequency: "DAILY",
    interval: 1,
    dayOfMonth: null,
    category: "Utilities",
    description: "Phone bill",
    reminderSchedules: [{ dayOffset: 0, time: "09:00" }],
    ...overrides,
  } as RecurringRule;
}

const now = new Date("2026-10-03T09:00:00.000Z");
describe("selected recurring reminder calendar", () => {
  it("anchors intervals to the first occurrence and ignores advanced posting state", () => {
    expect(
      occursOnDate(
        rule({ startDate: "2026-10-01", interval: 2, nextRunDate: "2026-10-05" }),
        "2026-10-03"
      )
    ).toBe(true);
    expect(occursOnDate(rule({ startDate: "2026-10-01", interval: 2 }), "2026-10-04")).toBe(false);
    expect(
      occursOnDate(
        rule({ startDate: "2026-10-01", frequency: "WEEKLY", interval: 2 }),
        "2026-10-15"
      )
    ).toBe(true);
    expect(
      occursOnDate(
        rule({ startDate: "2026-10-01", frequency: "WEEKLY", interval: 2 }),
        "2026-10-08"
      )
    ).toBe(false);
  });

  it("matches month clipping, the first start date, intervals and existing yearly leap behavior", () => {
    const monthly = rule({ frequency: "MONTHLY", dayOfMonth: 31, startDate: "2026-01-31" });
    expect(occursOnDate(monthly, "2026-02-28")).toBe(true);
    expect(occursOnDate(monthly, "2026-03-31")).toBe(true);
    expect(
      occursOnDate(
        rule({ frequency: "MONTHLY", interval: 2, dayOfMonth: 31, startDate: "2026-01-31" }),
        "2026-02-28"
      )
    ).toBe(false);
    expect(
      occursOnDate(
        rule({ frequency: "MONTHLY", dayOfMonth: 1, startDate: "2026-01-15" }),
        "2026-01-15"
      )
    ).toBe(true);
    expect(
      occursOnDate(
        rule({ frequency: "MONTHLY", dayOfMonth: 1, startDate: "2026-01-15" }),
        "2026-02-01"
      )
    ).toBe(true);
    expect(occursOnDate(rule({ frequency: "YEARLY", startDate: "2024-02-29" }), "2025-03-01")).toBe(
      true
    );
    expect(
      occursOnDate(
        rule({ frequency: "YEARLY", startDate: "2024-02-29", interval: 4 }),
        "2028-02-29"
      )
    ).toBe(true);
  });

  it("supports before, due-day and after reminders even when posting has already advanced", () => {
    const monthly = rule({
      startDate: "2026-10-03",
      nextRunDate: "2026-11-03",
      frequency: "MONTHLY",
      dayOfMonth: 3,
      reminderSchedules: [
        { dayOffset: -1, time: "09:00" },
        { dayOffset: 0, time: "09:00" },
        { dayOffset: 1, time: "09:00" },
      ],
    });
    for (const day of [2, 3, 4]) {
      expect(
        dueRecurringReminders(monthly, "UTC", new Date(`2026-10-0${day}T09:00:00.000Z`))
      ).toEqual([{ occurrenceDate: "2026-10-03", reminderAt: `2026-10-0${day}T09:00:00.000Z` }]);
    }
  });

  it("can remind after an occurrence end date while the rule remains active", () => {
    expect(
      dueRecurringReminders(
        rule({
          startDate: "2026-10-02",
          endDate: "2026-10-02",
          reminderSchedules: [{ dayOffset: 1, time: "09:00" }],
        }),
        "UTC",
        now
      )
    ).toEqual([{ occurrenceDate: "2026-10-02", reminderAt: now.toISOString() }]);
    expect(dueRecurringReminders(rule({ endDate: "2026-10-02" }), "UTC", now)).toEqual([]);
  });

  it("checks yesterday's local reminder date across midnight and bounds lateness to three hours", () => {
    const selected = rule({ reminderSchedules: [{ dayOffset: 0, time: "23:30" }] });
    expect(dueRecurringReminders(selected, "UTC", new Date("2026-10-04T01:00:00.000Z"))).toEqual([
      { occurrenceDate: "2026-10-03", reminderAt: "2026-10-03T23:30:00.000Z" },
    ]);
    expect(dueRecurringReminders(selected, "UTC", new Date("2026-10-04T02:30:00.000Z"))).toEqual(
      []
    );
  });

  it.each([
    ["America/Toronto", "2026-03-08T13:00:00.000Z", "2026-03-08"],
    ["America/Toronto", "2026-11-01T14:00:00.000Z", "2026-11-01"],
    ["Asia/Kathmandu", "2026-10-03T03:15:00.000Z", "2026-10-03"],
    ["Pacific/Kiritimati", "2026-12-31T19:00:00.000Z", "2027-01-01"],
    ["Pacific/Tarawa", "2026-10-02T21:00:00.000Z", "2026-10-03"],
  ])("uses household time in %s", (timezone, instant, occurrenceDate) => {
    expect(dueRecurringReminders(rule(), timezone, new Date(instant))).toEqual([
      { occurrenceDate, reminderAt: instant },
    ]);
  });

  it("uses the earlier DST fold and shifts nonexistent times to the first valid minute", () => {
    expect(recurringReminderTimeToUtc("2026-11-01", "01:30", "America/Toronto")).toBe(
      "2026-11-01T05:30:00.000Z"
    );
    expect(recurringReminderTimeToUtc("2026-03-08", "02:30", "America/Toronto")).toBe(
      "2026-03-08T07:00:00.000Z"
    );
    expect(recurringReminderTimeToUtc("2026-10-04", "02:15", "Australia/Lord_Howe")).toBe(
      "2026-10-03T15:30:00.000Z"
    );
    expect(recurringReminderTimeToUtc("2011-12-30", "09:00", "Pacific/Apia")).toBeNull();
  });

  it("supports long calendar offsets without tying them to the next run", () => {
    expect(
      dueRecurringReminders(
        rule({
          startDate: "2100-01-01",
          nextRunDate: "2101-01-01",
          frequency: "YEARLY",
          reminderSchedules: [{ dayOffset: -365, time: "09:00" }],
        }),
        "UTC",
        new Date("2099-01-01T09:00:00.000Z")
      )
    ).toEqual([{ occurrenceDate: "2100-01-01", reminderAt: "2099-01-01T09:00:00.000Z" }]);
  });

  it("supports income and deduplicates schedules that resolve to the same DST instant", () => {
    expect(dueRecurringReminders(rule({ type: "income" }), "UTC", now)).toHaveLength(1);
    expect(
      dueRecurringReminders(
        rule({
          reminderSchedules: [
            { dayOffset: 0, time: "02:30" },
            { dayOffset: 0, time: "03:00" },
          ],
        }),
        "America/Toronto",
        new Date("2026-03-08T07:00:00.000Z")
      )
    ).toHaveLength(1);
  });

  it.each([
    { active: false },
    { deletedAt: new Date() },
    { interval: 0 },
    { interval: -1 },
    { interval: NaN },
    { interval: 0.5 },
    { startDate: "invalid" },
    { startDate: "2026-10-05" },
    { reminderSchedules: [] },
    { reminderSchedules: [{ dayOffset: 36_601, time: "09:00" }] },
    { reminderSchedules: [{ dayOffset: 0, time: "25:00" }] },
  ])("ignores ineligible schedules %o", (overrides) => {
    expect(dueRecurringReminders(rule(overrides), "UTC", now)).toEqual([]);
  });
});

it("localizes one recurring reminder with a stable occurrence/time tag", () => {
  const reminder = { occurrenceDate: "2026-10-03", reminderAt: now.toISOString() };
  expect(buildRecurringReminderPayload(rule(), reminder, "es")).toMatchObject({
    body: "Recordatorio: Phone bill",
    data: { url: "/financial/recurring", type: "recurring-reminder" },
  });
  expect(buildRecurringReminderPayload(rule(), reminder, "en").tag).not.toBe(
    buildRecurringReminderPayload(
      rule(),
      { ...reminder, reminderAt: "2026-10-03T10:00:00.000Z" },
      "en"
    ).tag
  );
});
