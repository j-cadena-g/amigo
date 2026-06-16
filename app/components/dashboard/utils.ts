const CATEGORY_ICONS: Record<string, string> = {
  food: "🍕",
  groceries: "🛒",
  transport: "🚗",
  entertainment: "🎬",
  utilities: "💡",
  housing: "🏠",
  health: "🏥",
  shopping: "🛍️",
  salary: "💰",
  freelance: "💻",
  investment: "📈",
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] ?? "📋";
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
