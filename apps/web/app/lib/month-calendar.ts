import { capitalizeFirst } from "@/app/lib/format-dates";
import type { MonthStripDay } from "@/app/lib/month-strip";

/** Move a YYYY-MM key by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(
  month: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(locale, {
    ...options,
    timeZone: "UTC",
  });
}

/** "September 2026" / "Septiembre de 2026" for a YYYY-MM key, as a heading. */
export function formatMonthLabel(month: string, locale: string): string {
  return capitalizeFirst(formatMonth(month, locale, { month: "long", year: "numeric" }), locale);
}

/** "September" / "septiembre" (with the year if asked), for use mid-sentence. */
export function formatMonthInSentence(
  month: string,
  locale: string,
  { withYear = false }: { withYear?: boolean } = {}
): string {
  return formatMonth(month, locale, withYear ? { month: "long", year: "numeric" } : { month: "long" });
}

/** Short weekday names, Sunday first: "Sun"…"Sat", "Dom"…"Sáb". */
export function weekdayHeaders(locale: string): string[] {
  // 2026-09-06 is a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    capitalizeFirst(
      new Date(Date.UTC(2026, 8, 6 + i)).toLocaleDateString(locale, {
        weekday: "short",
        timeZone: "UTC",
      }),
      locale
    )
  );
}

/** Blank cells before the 1st in a Sunday-first week. */
export function leadingBlankDays(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
}

/** Scheduled money still ahead in the month: today onward. */
export function scheduledAhead(days: MonthStripDay[], todayStr: string) {
  let dueCents = 0;
  let expectedCents = 0;
  for (const day of days) {
    if (day.date < todayStr) continue;
    dueCents += day.scheduledSpentCents;
    expectedCents += day.scheduledReceivedCents;
  }
  return { dueCents, expectedCents };
}
