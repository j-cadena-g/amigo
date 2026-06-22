import { and, eq, inArray, isNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import {
  financialCategories,
  type FinancialCategory,
} from "./schema/financial-categories";
import type * as schema from "./schema";

type CategorySeedDb = ReturnType<typeof drizzle<typeof schema>>;

export const STARTER_FINANCIAL_CATEGORIES = [
  { name: "Groceries", type: "expense" as const, sortOrder: 0 },
  { name: "Living expenses", type: "expense" as const, sortOrder: 1 },
  { name: "Subscriptions", type: "expense" as const, sortOrder: 2 },
] as const;

export async function seedStarterFinancialCategories(
  db: CategorySeedDb,
  householdId: string
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

  const now = new Date();
  const rows = STARTER_FINANCIAL_CATEGORIES.map((starter) => ({
    id: crypto.randomUUID(),
    householdId,
    parentId: null,
    name: starter.name,
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
      inArray(
        financialCategories.name,
        STARTER_FINANCIAL_CATEGORIES.map((starter) => starter.name)
      )
    ),
    orderBy: (category, { asc }) => [asc(category.sortOrder), asc(category.name)],
  });
}
