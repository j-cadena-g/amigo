import type { GroceryTagColor } from "@amigo/db";

/** Stored tag color names mapped to the `--tag-*` dot colors in app.css. */
export const tagColors: Record<GroceryTagColor, string> = {
  red: "bg-(--tag-red)",
  orange: "bg-(--tag-orange)",
  yellow: "bg-(--tag-yellow)",
  lime: "bg-(--tag-lime)",
  green: "bg-(--tag-green)",
  teal: "bg-(--tag-teal)",
  cyan: "bg-(--tag-cyan)",
  blue: "bg-(--tag-blue)",
  indigo: "bg-(--tag-indigo)",
  purple: "bg-(--tag-purple)",
  magenta: "bg-(--tag-magenta)",
  pink: "bg-(--tag-pink)",
  brown: "bg-(--tag-brown)",
  gray: "bg-(--tag-gray)",
  ink: "bg-(--tag-ink)",
};

export type TagColorKey = GroceryTagColor;

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
