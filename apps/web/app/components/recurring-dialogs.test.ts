import { afterEach, describe, expect, it, vi } from "vitest";
import { localDateString, rebaseRecurringFormReminders, recurringFormOccurrenceDate, recurringRequestBody, type RecurringFormData } from "./recurring-dialogs";

function form(type: "income" | "expense"): RecurringFormData {
  return {
    type, amount: "100", currency: "CAD", categoryId: "category", description: "",
    schedulePreset: "monthly-1", customFrequency: "MONTHLY", customInterval: "1",
    customDayOfMonth: "1", startDate: "2026-10-01", endDate: "", budgetId: "budget",
    reminderOccurrenceDate: "2026-10-01",
    reminderSchedules: [{ date: "2026-09-30", time: "09:00" }],
  };
}

const today = "2026-10-01";

describe("recurring calendar reminder payload", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    { timeZone: "America/Toronto", instant: "2026-10-05T01:30:00.000Z", localToday: "2026-10-04", reminderDate: "2026-10-03" },
    { timeZone: "Asia/Tokyo", instant: "2026-10-04T16:30:00.000Z", localToday: "2026-10-05", reminderDate: "2026-10-04" },
  ])("keeps calendar selections on the household date in $timeZone across UTC midnight", ({ timeZone, instant, localToday, reminderDate }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    const householdToday = localDateString(timeZone);
    const selected = {
      ...form("expense"), schedulePreset: "daily" as const, startDate: "2026-10-04",
      reminderOccurrenceDate: localToday,
      reminderSchedules: [{ date: reminderDate, time: "09:00" }],
    };
    expect(householdToday).toBe(localToday);
    expect(recurringFormOccurrenceDate(selected, householdToday)).toBe(localToday);
    expect(recurringRequestBody(selected, householdToday).reminderSchedules)
      .toEqual([{ dayOffset: -1, time: "09:00" }]);
  });

  it.each(["income", "expense"] as const)("includes calendar selections for %s without changing transaction amounts", (type) => {
    const body = recurringRequestBody(form(type), today);
    expect(body.type).toBe(type);
    expect(body.amount).toBe(100);
    expect(body.reminderSchedules).toEqual([{ dayOffset: -1, time: "09:00" }]);
    expect(body.budgetId).toBe(type === "expense" ? "budget" : null);
  });

  it("sends an empty array when all reminders are removed", () => {
    expect(recurringRequestBody({ ...form("income"), reminderSchedules: [] }, today).reminderSchedules).toEqual([]);
  });

  it("preserves repeat timing when the recurrence changes before the UI rebase effect runs", () => {
    const changed = { ...form("expense"), startDate: "2026-11-01" };
    expect(recurringFormOccurrenceDate(changed, today)).toBe("2026-11-01");
    expect(recurringRequestBody(changed, today).reminderSchedules).toEqual([{ dayOffset: -1, time: "09:00" }]);
  });

  it("keeps the last valid anchor while the start date is cleared and re-entered", () => {
    const cleared = { ...form("expense"), startDate: "" };
    const pending = rebaseRecurringFormReminders(cleared, recurringFormOccurrenceDate(cleared, today));
    expect(pending.reminderOccurrenceDate).toBe("2026-10-01");
    expect(pending.reminderSchedules).toEqual([{ date: "2026-09-30", time: "09:00" }]);
    const entered = { ...pending, startDate: "2026-11-01" };
    const rebased = rebaseRecurringFormReminders(entered, recurringFormOccurrenceDate(entered, today));
    expect(rebased.reminderSchedules).toEqual([{ date: "2026-10-31", time: "09:00" }]);
    expect(recurringRequestBody(rebased, today).reminderSchedules).toEqual([{ dayOffset: -1, time: "09:00" }]);
  });

  it("retains the selected calendar day as the reference for an exhausted series", () => {
    const ended = {
      ...form("expense"), endDate: "2026-10-01",
      reminderSchedules: [{ date: "2026-10-03", time: "15:30" }],
    };
    expect(recurringFormOccurrenceDate(ended, "2026-11-01")).toBe("2026-10-01");
    expect(recurringRequestBody(ended, "2026-11-01").reminderSchedules).toEqual([{ dayOffset: 2, time: "15:30" }]);
  });
});
