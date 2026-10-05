import { describe, expect, it } from "vitest";
import {
  hasNewRecurringReminderSchedules, rebaseRecurringReminderDrafts, recurringReminderDrafts,
  recurringReminderOccurrenceDate, recurringReminderPayload, shiftReminderDate,
  type RecurringReminderDraft,
} from "./recurring-reminder-schedules";

const occurrence = "2026-11-02";
const draft = (date: string, time = "09:00"): RecurringReminderDraft => ({ date, time });

describe("calendar selections for recurring reminders", () => {
  it("converts four chosen dates to repeating calendar offsets across month and DST boundaries", () => {
    expect(recurringReminderPayload([
      draft("2026-10-26"), draft("2026-11-01", "21:30"),
      draft(occurrence), draft("2026-11-04", "08:15"),
    ], occurrence)).toEqual([
      { dayOffset: -7, time: "09:00" }, { dayOffset: -1, time: "21:30" },
      { dayOffset: 0, time: "09:00" }, { dayOffset: 2, time: "08:15" },
    ]);
  });

  it("round-trips saved schedules on the next occurrence without changing delivery or device setup", () => {
    const schedules = [{ dayOffset: -1, time: "09:00" }, { dayOffset: 3, time: "23:45" }];
    const displayed = recurringReminderDrafts(schedules, occurrence);
    expect(displayed).toEqual([draft("2026-11-01"), draft("2026-11-05", "23:45")]);
    const edited = recurringReminderPayload(displayed, occurrence);
    expect(edited).toEqual(schedules);
    expect(hasNewRecurringReminderSchedules(edited, schedules)).toBe(false);
  });

  it("rebases calendar selections when the recurrence changes, preserving offsets and partial fields", () => {
    const drafts = [draft("2026-10-31", "18:00"), draft("", ""), draft("2026-11-03")];
    expect(rebaseRecurringReminderDrafts(drafts, occurrence, "2026-12-02"))
      .toEqual([draft("2026-11-30", "18:00"), draft("", ""), draft("2026-12-03")]);
    expect(rebaseRecurringReminderDrafts(drafts, occurrence, "")).toEqual(drafts);
  });

  it("accepts four choices and rejects a fifth", () => {
    const four = [1, 2, 3, 4].map(day => draft(`2026-11-0${day}`));
    expect(recurringReminderPayload(four, occurrence)).toHaveLength(4);
    expect(() => recurringReminderPayload([...four, draft("2026-11-05")], occurrence))
      .toThrow(expect.objectContaining({ code: "limit" }));
  });

  it("rejects duplicate date/time selections", () => {
    expect(() => recurringReminderPayload([draft(occurrence), draft(occurrence)], occurrence))
      .toThrow(expect.objectContaining({ code: "duplicate" }));
  });

  it("rejects invalid calendar dates and out-of-range offsets while permitting cancellation with a blank anchor", () => {
    for (const date of ["", "2026-02-30", "2026-1-01", "2026-01-01T09:00", "2200-01-01"]) {
      expect(() => recurringReminderPayload([draft(date)], occurrence))
        .toThrow(expect.objectContaining({ code: "date" }));
    }
    expect(() => recurringReminderPayload([draft(occurrence)], ""))
      .toThrow(expect.objectContaining({ code: "date" }));
    expect(recurringReminderPayload([], "")).toEqual([]);
  });

  it("accepts midnight and rejects incomplete or impossible clocks", () => {
    expect(recurringReminderPayload([draft(occurrence, "00:00")], occurrence))
      .toEqual([{ dayOffset: 0, time: "00:00" }]);
    for (const time of ["", "24:00", "12:60", "9:00", "09:00:30"]) {
      expect(() => recurringReminderPayload([draft(occurrence, time)], occurrence))
        .toThrow(expect.objectContaining({ code: "time" }));
    }
  });

  it("does not request permissions for unchanged, reordered, removal-only or cleared choices", () => {
    const existing = [{ dayOffset: -1, time: "09:00" }, { dayOffset: 0, time: "08:00" }];
    expect(hasNewRecurringReminderSchedules(existing, existing)).toBe(false);
    expect(hasNewRecurringReminderSchedules([...existing].reverse(), existing)).toBe(false);
    expect(hasNewRecurringReminderSchedules(existing.slice(0, 1), existing)).toBe(false);
    expect(hasNewRecurringReminderSchedules([], existing)).toBe(false);
    expect(hasNewRecurringReminderSchedules([{ dayOffset: -1, time: "10:00" }], existing)).toBe(true);
  });

  it("day-before preset crosses leap days and year boundaries", () => {
    expect(shiftReminderDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftReminderDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftReminderDate("", -1)).toBe("");
  });
});

describe("the calendar's reference occurrence", () => {
  const monthly = { startDate: "2026-01-31", frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 31 };

  it("uses the upcoming clipped month and preserves the original first occurrence", () => {
    expect(recurringReminderOccurrenceDate(monthly, "2026-02-01")).toBe("2026-02-28");
    expect(recurringReminderOccurrenceDate(monthly, "2026-03-01")).toBe("2026-03-31");
    expect(recurringReminderOccurrenceDate({ ...monthly, startDate: "2026-11-02", dayOfMonth: 1 }, "2026-11-01"))
      .toBe("2026-11-02");
  });

  it("references the final occurrence of exhausted series so after-date reminders remain editable", () => {
    expect(recurringReminderOccurrenceDate({ ...monthly, endDate: "2026-03-31" }, "2026-04-03"))
      .toBe("2026-03-31");
    expect(recurringReminderOccurrenceDate({ startDate: "2026-10-01", endDate: "2026-10-04", frequency: "DAILY", interval: 2 }, "2026-10-10"))
      .toBe("2026-10-03");
  });

  it("respects every-other-week anchors and leap-year drift from the posting schedule", () => {
    expect(recurringReminderOccurrenceDate({ startDate: "2026-10-01", frequency: "WEEKLY", interval: 2 }, "2026-10-02"))
      .toBe("2026-10-15");
    expect(recurringReminderOccurrenceDate({ startDate: "2024-02-29", frequency: "YEARLY", interval: 1 }, "2028-02-29"))
      .toBe("2028-03-01");
  });

  it("keeps incomplete recurrence edits safe to render", () => {
    expect(recurringReminderOccurrenceDate({ ...monthly, startDate: "" }, "2026-10-01")).toBe("");
    expect(recurringReminderOccurrenceDate({ ...monthly, interval: 0 }, "2026-10-01")).toBe(monthly.startDate);
  });
});
