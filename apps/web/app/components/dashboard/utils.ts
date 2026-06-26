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
