/** Stored tag color names mapped to the `--tag-*` dot colors in app.css. */
export const tagColors = {
  blue: "bg-(--tag-blue)",
  green: "bg-(--tag-green)",
  red: "bg-(--tag-red)",
  yellow: "bg-(--tag-yellow)",
  purple: "bg-(--tag-purple)",
  orange: "bg-(--tag-orange)",
  pink: "bg-(--tag-pink)",
  gray: "bg-(--tag-gray)",
} as const;

export type TagColorKey = keyof typeof tagColors;

export function tagColorKey(color: string): TagColorKey {
  return color in tagColors ? (color as TagColorKey) : "gray";
}

/**
 * Format a Date as a `YYYY-MM-DD` string in the user's local timezone, for use
 * as an `<input type="date">` value. Using local components (not `toISOString`,
 * which is UTC) avoids the off-by-one day shift for evening times west of UTC.
 */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatHistoryDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
