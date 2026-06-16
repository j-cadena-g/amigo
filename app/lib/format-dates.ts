const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Format a calendar date relative to household-local today (YYYY-MM-DD). */
export function formatRelativeDate(dateStr: string, todayIso: string): string {
  const targetIso = dateStr.split("T")[0]!;
  const targetUtc = Date.parse(`${targetIso}T00:00:00Z`);
  const todayUtc = Date.parse(`${todayIso}T00:00:00Z`);
  const diffDays = Math.round((targetUtc - todayUtc) / MS_PER_DAY);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

  const date = new Date(`${targetIso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatTransactionDate(date: string): string {
  const dateOnly = date.split("T")[0]!;
  const d = new Date(dateOnly + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
