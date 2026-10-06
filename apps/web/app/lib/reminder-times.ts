/** Native datetime inputs are household wall times, never the browser's time zone. */
export const MAX_TRANSACTION_REMINDERS = 4;

export type ReminderTimeErrorCode = "invalid" | "past" | "duplicate" | "limit";

export class ReminderTimeError extends Error {
  constructor(public readonly code: ReminderTimeErrorCode) {
    super(`Invalid transaction reminder: ${code}`);
    this.name = "ReminderTimeError";
  }
}

function utcWallTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new ReminderTimeError("invalid");
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(hour!, minute!, 0, 0);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value) {
    throw new ReminderTimeError("invalid");
  }
  return date.getTime();
}

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
}

function localParts(timestamp: number, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(format.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function reminderTimeToLocal(instant: string, timeZone: string): string {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) throw new ReminderTimeError("invalid");
  return localParts(timestamp, formatter(timeZone)).slice(0, 16);
}

/** Reject skipped DST times; choose the earlier instant when a wall time repeats. */
export function localReminderTimeToUtc(localTime: string, timeZone: string): string {
  const nominal = utcWallTime(localTime);
  const format = formatter(timeZone);
  const offsets = new Set<number>();
  // Sample both sides of nearby transitions, including non-hour offsets.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = nominal + hours * 3_600_000;
    const wall = localParts(sample, format);
    offsets.add(utcWallTime(wall.slice(0, 16)) + Number(wall.slice(-2)) * 1000 - sample);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((candidate) => localParts(candidate, format) === `${localTime}:00`);
  if (!matches.length) throw new ReminderTimeError("invalid");
  return new Date(Math.min(...matches)).toISOString();
}

/** A concrete editable date/time; transaction date edits do not move it. */
export function dayBeforeReminder(transactionDate: string): string {
  const date = new Date(utcWallTime(`${transactionDate}T09:00`));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 16);
}

export function transactionReminderPayload(
  localTimes: string[],
  timeZone: string,
  existingTimes: string[] = [],
  now = Date.now()
): string[] {
  if (localTimes.length > MAX_TRANSACTION_REMINDERS) throw new ReminderTimeError("limit");
  const result = localTimes.map((local) => {
    // Keep the exact stored instant (and its DST choice) when left unchanged.
    const existing = existingTimes.find((instant) => reminderTimeToLocal(instant, timeZone) === local);
    const instant = existing ?? localReminderTimeToUtc(local, timeZone);
    if (!existing && Date.parse(instant) <= now) throw new ReminderTimeError("past");
    return instant;
  });
  if (new Set(result).size !== result.length) throw new ReminderTimeError("duplicate");
  return result;
}

export function hasNewFutureReminders(times: string[], existingTimes: string[] = [], now = Date.now()): boolean {
  return times.some((time) => Date.parse(time) > now && !existingTimes.includes(time));
}
