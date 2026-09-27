import type { MonthStripDay } from "@/app/lib/month-strip";

/** Move a YYYY-MM key by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "September 2026" for a YYYY-MM key. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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
