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

export function formatRelativeDate(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
