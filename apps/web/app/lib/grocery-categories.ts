// Departments that Real Canadian Superstore, Sobeys (Voilà), and Metro share,
// in the order you'd walk a typical store: fresh counters, centre aisles,
// frozen near the end, then non-food. The list's sections follow this order.
export const GROCERY_CATEGORIES = [
  "Fruits & Vegetables",
  "Bakery",
  "Deli",
  "Meat",
  "Fish & Seafood",
  "Dairy & Eggs",
  "Pantry",
  "International Foods",
  "Snacks",
  "Beverages",
  "Frozen",
  "Household",
  "Health & Beauty",
  "Baby",
  "Pet Care",
  "Beer & Wine",
  "General",
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export const DEFAULT_GROCERY_CATEGORY: GroceryCategory = "General";

export const GROCERY_CATEGORY_CRITERIA: Record<GroceryCategory, string> = {
  "Fruits & Vegetables":
    "Fresh fruits, vegetables, and herbs, plus packaged salads. Includes frutas, verduras, aguacate, lechuga, manzana, cilantro, papas (potatoes).",
  Bakery:
    "Bread, buns, bagels, tortillas, and baked goods such as croissants, muffins, and cakes. Includes pan, bolillo, pan dulce, tortillas.",
  Deli:
    "Deli counter meats and cheeses, rotisserie chicken, and ready-to-eat meals, salads, and sushi. Includes jamón rebanado, pollo rostizado, comida preparada.",
  Meat: "Fresh beef, chicken, pork, turkey, ground meat, bacon, and sausages. Includes carne, pollo, res, cerdo, chorizo, tocino.",
  "Fish & Seafood":
    "Fresh fish and shellfish. Includes pescado, camarón, salmón, tilapia.",
  "Dairy & Eggs":
    "Milk, cheese, yogurt, butter, cream, and eggs. Includes leche, queso, yogur, mantequilla, crema, huevos.",
  Pantry:
    "Canned and dry goods: rice, pasta, beans, flour, sugar, oil, spices, sauces, cereal, and baking supplies. Includes arroz, pasta, frijoles, harina, azúcar, aceite, atún en lata.",
  "International Foods":
    "Mexican, Latin American, Asian, and other world foods from the international aisle. Includes salsa, chiles en lata, masa harina, frijoles refritos, salsa de soya.",
  Snacks:
    "Chips, crackers, cookies, candy, chocolate, nuts, and popcorn. Includes papitas, galletas, dulces, cacahuates.",
  Beverages:
    "Drinks other than milk and alcohol: water, juice, pop, coffee, and tea. Includes agua, jugo, refresco, café, té.",
  Frozen:
    "Frozen meals, pizza, vegetables, fries, nuggets, and ice cream. Includes congelados, helado, pizza congelada.",
  Household:
    "Cleaning supplies, laundry, dish soap, paper towels, toilet paper, garbage bags, foil, batteries, and light bulbs. Includes detergente, jabón para trastes, papel higiénico, cloro, pilas, focos.",
  "Health & Beauty":
    "Personal care, beauty, and pharmacy: shampoo, toothpaste, deodorant, body soap, razors, vitamins, and medicine. Includes champú, pasta de dientes, desodorante, medicina.",
  Baby: "Diapers, wipes, formula, and baby food. Includes pañales, toallitas, fórmula, comida para bebé.",
  "Pet Care":
    "Pet food, treats, litter, and supplies. Includes comida para perro, comida para gato, arena para gato.",
  "Beer & Wine":
    "Beer, wine, cider, coolers, and spirits. Includes cerveza, chelas, vino, tequila.",
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
