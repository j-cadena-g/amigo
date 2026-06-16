const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatIsoDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseIsoParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Calendar day in household timezone (YYYY-MM-DD). */
export function todayInTz(timeZone: string, now = new Date()): string {
  return formatIsoDateInTz(now, timeZone);
}

/** Convert an instant to household-local calendar day. */
export function toISODateInTz(date: Date, timeZone: string): string {
  return formatIsoDateInTz(date, timeZone);
}

function weekdayInTz(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = parseIsoParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function lastDayOfMonthIso(y: number, m: number): string {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type BudgetPeriod = "weekly" | "monthly" | "yearly";

export function getPeriodBounds(
  period: BudgetPeriod,
  now = new Date(),
  timeZone = "UTC"
): { start: string; end: string } {
  const today = todayInTz(timeZone, now);
  const { y, m } = parseIsoParts(today);

  switch (period) {
    case "weekly": {
      const dow = weekdayInTz(now, timeZone);
      const start = addDaysIso(today, -dow);
      const end = addDaysIso(start, 6);
      return { start, end };
    }
    case "monthly": {
      const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
      const end = lastDayOfMonthIso(y, m);
      return { start, end };
    }
    case "yearly": {
      const start = `${String(y).padStart(4, "0")}-01-01`;
      const end = `${String(y).padStart(4, "0")}-12-31`;
      return { start, end };
    }
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

export function monthBoundsInTz(
  now = new Date(),
  timeZone = "UTC"
): { start: string; end: string } {
  return getPeriodBounds("monthly", now, timeZone);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDateString(val: string): boolean {
  if (!ISO_DATE.test(val)) return false;
  const { y, m, d } = parseIsoParts(val);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const filled: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") filled[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(filled.year),
    Number(filled.month) - 1,
    Number(filled.day),
    Number(filled.hour),
    Number(filled.minute),
    Number(filled.second)
  );
  return asUtc - instant.getTime();
}

/** Wall-clock time in a timezone → UTC instant (handles DST with one refinement pass). */
export function zonedDateTimeToUtc(
  isoDate: string,
  time: string,
  timeZone: string
): Date {
  const { y, m, d } = parseIsoParts(isoDate);
  const [hh, mm, ssFrac = "0"] = time.split(":");
  const [ss, ms = "0"] = ssFrac.split(".");
  const utcGuess = Date.UTC(
    y,
    m - 1,
    d,
    Number(hh),
    Number(mm),
    Number(ss),
    Number(ms.padEnd(3, "0").slice(0, 3))
  );
  let instant = new Date(utcGuess);
  let offset = getTimeZoneOffsetMs(instant, timeZone);
  instant = new Date(utcGuess - offset);
  const refinedOffset = getTimeZoneOffsetMs(instant, timeZone);
  if (refinedOffset !== offset) {
    offset = refinedOffset;
    instant = new Date(utcGuess - offset);
  }
  return instant;
}

export function startOfIsoDayInTz(iso: string, timeZone: string): Date {
  return zonedDateTimeToUtc(iso, "00:00:00", timeZone);
}

export function endOfIsoDayInTz(iso: string, timeZone: string): Date {
  return zonedDateTimeToUtc(iso, "23:59:59.999", timeZone);
}
