export const GROCERY_CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat",
  "Seafood",
  "Bakery",
  "Frozen",
  "Pantry",
  "Beverages",
  "Snacks",
  "Household",
  "General",
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export const DEFAULT_GROCERY_CATEGORY: GroceryCategory = "General";

export const GROCERY_CATEGORY_CRITERIA: Record<GroceryCategory, string> = {
  Produce:
    "Fruits and vegetables. Includes frutas, verduras, aguacate, lechuga, manzana.",
  Dairy:
    "Milk, cheese, yogurt, butter, and eggs. Includes leche, queso, yogur, huevos.",
  Meat: "Beef, chicken, pork, and other meat. Includes carne, pollo, res, cerdo.",
  Seafood: "Fish and shellfish. Includes pescado, camarón, atún.",
  Bakery: "Bread and baked goods. Includes pan, tortillas, bolillo.",
  Frozen:
    "Frozen meals, ice cream, and frozen vegetables. Includes congelados, helado.",
  Pantry:
    "Dry goods, canned food, rice, pasta, oil, and spices. Includes arroz, pasta, frijoles, aceite.",
  Beverages:
    "Drinks other than milk. Includes jugo, refresco, café, agua.",
  Snacks: "Chips, cookies, and candy. Includes papas, galletas, dulces.",
  Household:
    "Cleaning supplies, paper goods, and soap. Includes jabón, papel higiénico, detergente.",
  General: "Does not fit another aisle.",
};

const GROCERY_CATEGORY_SET: ReadonlySet<string> = new Set(GROCERY_CATEGORIES);

export function isGroceryCategory(
  value: string | null | undefined
): value is GroceryCategory {
  return typeof value === "string" && GROCERY_CATEGORY_SET.has(value);
}

export function groupGroceriesByAisle<T extends { category: string | null }>(
  items: T[]
): { category: GroceryCategory; items: T[] }[] {
  const buckets = new Map<GroceryCategory, T[]>();
  for (const item of items) {
    const category = isGroceryCategory(item.category)
      ? item.category
      : DEFAULT_GROCERY_CATEGORY;
    const group = buckets.get(category);
    if (group) {
      group.push(item);
    } else {
      buckets.set(category, [item]);
    }
  }

  return GROCERY_CATEGORIES.flatMap((category) => {
    const group = buckets.get(category);
    return group && group.length > 0 ? [{ category, items: group }] : [];
  });
}
