import type { UiLanguage } from "@amigo/db";
import { messagesFor } from "@/app/i18n";

export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringFrequencyInput {
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
}

/** "Monday" / "lunes" for 0 = Sunday … 6 = Saturday. */
function weekdayName(dayOfWeek: number, language: UiLanguage): string {
  // 2026-09-06 is a Sunday.
  return new Date(Date.UTC(2026, 8, 6 + dayOfWeek)).toLocaleDateString(language, {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function getFrequencyLabel(rule: RecurringFrequencyInput, language: UiLanguage): string {
  const { frequency, interval, dayOfMonth, dayOfWeek } = rule;
  const label = messagesFor(language).recurring.label;

  switch (frequency) {
    case "DAILY":
      return label.daily(interval);
    case "WEEKLY":
      return label.weekly(
        interval,
        dayOfWeek !== null && dayOfWeek !== undefined ? weekdayName(dayOfWeek, language) : null
      );
    case "MONTHLY":
      // The scheduler clamps day 31 to each month's last day.
      return label.monthly(
        interval,
        dayOfMonth === 31 ? "last" : dayOfMonth !== null && dayOfMonth !== undefined ? dayOfMonth : null
      );
    case "YEARLY":
      return label.yearly(interval);
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}
