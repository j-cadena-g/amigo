import { and, eq, inArray, isNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import {
  financialCategories,
  type FinancialCategory,
} from "./schema/financial-categories";
import type * as schema from "./schema";
import type { UiLanguage } from "./schema/users";

type CategorySeedDb = ReturnType<typeof drizzle<typeof schema>>;

export const STARTER_FINANCIAL_CATEGORIES = [
  { name: "Groceries", type: "expense" as const, sortOrder: 0 },
  { name: "Living expenses", type: "expense" as const, sortOrder: 1 },
  { name: "Subscriptions", type: "expense" as const, sortOrder: 2 },
] as const;

/** Starter names by interface language, in STARTER_FINANCIAL_CATEGORIES order. */
const STARTER_NAMES: Record<UiLanguage, readonly [string, string, string]> = {
  en: ["Groceries", "Living expenses", "Subscriptions"],
  es: ["Mercado", "Gastos del hogar", "Suscripciones"],
};

/**
 * Give a household its first categories, named in `language`. They're the
 * household's own data from then on, so later language changes leave them be.
 * `language` may be a lookup, run only when there is something to seed.
 */
export async function seedStarterFinancialCategories(
  db: CategorySeedDb,
  householdId: string,
  language: UiLanguage | (() => Promise<UiLanguage>) = "en"
): Promise<FinancialCategory[]> {
  const existing = await db.query.financialCategories.findFirst({
    where: and(
      eq(financialCategories.householdId, householdId),
      isNull(financialCategories.deletedAt)
    ),
  });

  if (existing) {
    return [];
  }

  const names = STARTER_NAMES[typeof language === "function" ? await language() : language];

  const now = new Date();
  const rows = STARTER_FINANCIAL_CATEGORIES.map((starter, index) => ({
    id: crypto.randomUUID(),
    householdId,
    parentId: null,
    name: names[index] ?? starter.name,
    type: starter.type,
    sortOrder: starter.sortOrder,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(financialCategories).values(rows).onConflictDoNothing();

  return db.query.financialCategories.findMany({
    where: and(
      eq(financialCategories.householdId, householdId),
      isNull(financialCategories.deletedAt),
      inArray(financialCategories.name, [...names])
    ),
    orderBy: (category, { asc }) => [asc(category.sortOrder), asc(category.name)],
  });
}
