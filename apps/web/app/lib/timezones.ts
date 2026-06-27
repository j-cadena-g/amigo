export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export function isSupportedTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function buildTimezoneOptions(selectedTimezone: string): string[] {
  if ((COMMON_TIMEZONES as readonly string[]).includes(selectedTimezone)) {
    return [...COMMON_TIMEZONES];
  }

  return [selectedTimezone, ...COMMON_TIMEZONES];
}

export function getBrowserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && isSupportedTimezone(timezone) ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}
