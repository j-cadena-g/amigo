export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Shared by posting, the calendar, and reminder dates so clipped months stay in agreement. */
export function calculateNextRunDate(
  frequency: RecurringFrequency,
  interval: number,
  fromDate: Date,
  dayOfMonth?: number | null
) {
  const next = new Date(fromDate);
  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + interval);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + interval * 7);
      break;
    case "MONTHLY": {
      const desiredDay = dayOfMonth ?? next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + interval);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
      ).getUTCDate();
      next.setUTCDate(Math.min(desiredDay, lastDay));
      break;
    }
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      break;
  }
  return next;
}
