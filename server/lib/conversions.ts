/**
 * Convert a dollar amount (float) to integer cents for D1 storage.
 * e.g., 12.34 → 1234
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert a Date to ISO 8601 date string (YYYY-MM-DD) for D1 text columns.
 */
export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
