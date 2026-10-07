import { calculateNextRunDate, type RecurringFrequency } from "./recurring-dates";

export const MAX_RECURRING_REMINDERS = 4;
export const MAX_REMINDER_DAY_OFFSET = 36_600;
const DAY_MS = 86_400_000;

export interface RecurringReminderSchedule {
  dayOffset: number;
  time: string;
}

export interface RecurringReminderDraft {
  date: string;
  time: string;
}

export class RecurringReminderError extends Error {
  constructor(public readonly code: "date" | "time" | "duplicate" | "limit") {
    super(`Invalid recurring reminder: ${code}`);
    this.name = "RecurringReminderError";
  }
}

function calendarDateMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp;
}

export function shiftReminderDate(date: string, dayOffset: number): string {
  const timestamp = calendarDateMs(date);
  if (timestamp === null || !Number.isSafeInteger(dayOffset)) return "";
  const shifted = new Date(timestamp + dayOffset * DAY_MS);
  if (!Number.isFinite(shifted.getTime())) return "";
  const value = shifted.toISOString().slice(0, 10);
  return calendarDateMs(value) === null ? "" : value;
}

/** Calendar selections display the next occurrence; storage repeats their relative timing. */
export function recurringReminderDrafts(
  schedules: RecurringReminderSchedule[], occurrenceDate: string
): RecurringReminderDraft[] {
  return schedules.map(({ dayOffset, time }) => ({ date: shiftReminderDate(occurrenceDate, dayOffset), time }));
}

export function recurringReminderPayload(
  drafts: RecurringReminderDraft[], occurrenceDate: string
): RecurringReminderSchedule[] {
  if (drafts.length > MAX_RECURRING_REMINDERS) throw new RecurringReminderError("limit");
  if (!drafts.length) return [];
  const occurrence = calendarDateMs(occurrenceDate);
  const schedules = drafts.map(({ date, time }) => {
    const selected = calendarDateMs(date);
    if (selected === null || occurrence === null) throw new RecurringReminderError("date");
    const dayOffset = (selected - occurrence) / DAY_MS;
    if (Math.abs(dayOffset) > MAX_REMINDER_DAY_OFFSET) throw new RecurringReminderError("date");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RecurringReminderError("time");
    return { dayOffset, time };
  });
  const keys = schedules.map(({ dayOffset, time }) => `${dayOffset}|${time}`);
  if (new Set(keys).size !== keys.length) throw new RecurringReminderError("duplicate");
  return schedules;
}

/** Preserve the repeat timing when the recurrence's next date moves. */
export function rebaseRecurringReminderDrafts(
  drafts: RecurringReminderDraft[], previousOccurrence: string, nextOccurrence: string
): RecurringReminderDraft[] {
  const previous = calendarDateMs(previousOccurrence);
  const next = calendarDateMs(nextOccurrence);
  if (previous === null || next === null) return drafts;
  const shift = (next - previous) / DAY_MS;
  return drafts.map((draft) => calendarDateMs(draft.date) === null
    ? draft : { ...draft, date: shiftReminderDate(draft.date, shift) });
}

interface Recurrence {
  startDate: string;
  endDate?: string | null;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth?: number | null;
}

/** Matches the posting API's start anchor, clipped months, and leap-year advancement. */
export function recurringReminderOccurrenceDate(rule: Recurrence, today: string): string {
  const start = calendarDateMs(rule.startDate);
  const target = calendarDateMs(today);
  const end = rule.endDate ? calendarDateMs(rule.endDate) : null;
  if (start === null || target === null || !Number.isSafeInteger(rule.interval) || rule.interval <= 0) {
    return rule.startDate;
  }
  if (rule.frequency === "DAILY" || rule.frequency === "WEEKLY") {
    const span = rule.interval * (rule.frequency === "WEEKLY" ? 7 : 1);
    let steps = Math.max(0, Math.ceil((target - start) / DAY_MS / span));
    if (end !== null && start + steps * span * DAY_MS > end) {
      steps = Math.max(0, Math.floor((end - start) / DAY_MS / span));
    }
    return shiftReminderDate(rule.startDate, steps * span);
  }
  let current = new Date(start);
  for (let i = 0; current.getTime() < target && i < 120_000; i++) {
    const next = calculateNextRunDate(rule.frequency, rule.interval, current, rule.dayOfMonth);
    // An exhausted series still has a final occurrence for after-date reminders.
    if (end !== null && next.getTime() > end) break;
    current = next;
  }
  return current.toISOString().slice(0, 10);
}

/** Clearing or merely reordering choices does not ask for device setup. */
export function hasNewRecurringReminderSchedules(
  next: RecurringReminderSchedule[], existing: RecurringReminderSchedule[] = []
): boolean {
  return next.some((selected) => !existing.some((saved) =>
    saved.dayOffset === selected.dayOffset && saved.time === selected.time
  ));
}
