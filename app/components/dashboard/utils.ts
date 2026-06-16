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

export function formatRelativeDate(dateStr: string): string {
  const dateOnly = dateStr.split("T")[0]!;
  const date = new Date(dateOnly + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / MS_PER_DAY);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
