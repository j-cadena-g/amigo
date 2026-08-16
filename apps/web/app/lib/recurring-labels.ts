export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringFrequencyInput {
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function getFrequencyLabel(rule: RecurringFrequencyInput): string {
  const { frequency, interval, dayOfMonth, dayOfWeek } = rule;

  switch (frequency) {
    case "DAILY":
      return interval === 1 ? "Daily" : `Every ${interval} days`;
    case "WEEKLY": {
      const dayName =
        dayOfWeek !== null && dayOfWeek !== undefined
          ? DAY_NAMES[dayOfWeek]
          : undefined;
      if (interval === 1) {
        return dayName ? `Every ${dayName}` : "Weekly";
      }
      return dayName
        ? `Every ${interval} weeks on ${dayName}`
        : `Every ${interval} weeks`;
    }
    case "MONTHLY": {
      const dayLabel =
        dayOfMonth !== null && dayOfMonth !== undefined
          ? ordinal(dayOfMonth)
          : null;
      if (interval === 1) {
        return dayLabel ? `${dayLabel} of every month` : "Monthly";
      }
      return dayLabel
        ? `${dayLabel} every ${interval} months`
        : `Every ${interval} months`;
    }
    case "YEARLY":
      return interval === 1 ? "Yearly" : `Every ${interval} years`;
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}
