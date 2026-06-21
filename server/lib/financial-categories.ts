import {
  and,
  budgetCategoryMappings,
  budgets,
  eq,
  financialCategories,
  inArray,
  isNull,
  recurringTransactions,
  scopeToHousehold,
  sql,
  transactions,
  visibleBudgetsCondition,
  type DrizzleD1,
  type FinancialCategory,
} from "@amigo/db";
import { ActionError } from "./errors";

export type CategoryListItem = FinancialCategory & {
  hasChildren: boolean;
  selectable: boolean;
};

export async function listFinancialCategories(
  db: DrizzleD1,
  householdId: string,
  options?: { includeArchived?: boolean }
): Promise<CategoryListItem[]> {
  const rows = await db.query.financialCategories.findMany({
    where: and(
      scopeToHousehold(financialCategories.householdId, householdId),
      isNull(financialCategories.deletedAt),
      options?.includeArchived ? undefined : eq(financialCategories.archived, false)
    ),
    orderBy: (category, { asc }) => [
      asc(category.type),
      asc(category.sortOrder),
      asc(category.name),
    ],
  });

  const childCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.parentId && !row.archived) {
      childCounts.set(row.parentId, (childCounts.get(row.parentId) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const hasChildren = (childCounts.get(row.id) ?? 0) > 0;
    return {
      ...row,
      hasChildren,
      selectable: !row.archived,
    };
  });
}

export async function getFinancialCategoryById(
  db: DrizzleD1,
  householdId: string,
  categoryId: string
): Promise<FinancialCategory | null> {
  return (
    (await db.query.financialCategories.findFirst({
      where: and(
        eq(financialCategories.id, categoryId),
        scopeToHousehold(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt)
      ),
    })) ?? null
  );
}

export async function assertSelectableFinancialCategory(
  db: DrizzleD1,
  householdId: string,
  categoryId: string,
  expectedType?: "income" | "expense"
): Promise<FinancialCategory> {
  const category = await getFinancialCategoryById(db, householdId, categoryId);
  if (!category || category.archived) {
    throw new ActionError("Unknown or archived category", "VALIDATION_ERROR");
  }

  if (expectedType && category.type !== expectedType) {
    throw new ActionError(
      `Category type must be ${expectedType}`,
      "VALIDATION_ERROR"
    );
  }

  return category;
}

export async function categoryHasUsage(
  db: DrizzleD1,
  householdId: string,
  categoryIds: string[]
): Promise<boolean> {
  if (categoryIds.length === 0) return false;

  const [txn, recurring] = await Promise.all([
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          scopeToHousehold(transactions.householdId, householdId),
          inArray(transactions.categoryId, categoryIds),
          isNull(transactions.deletedAt)
        )
      )
      .limit(1),
    db
      .select({ id: recurringTransactions.id })
      .from(recurringTransactions)
      .where(
        and(
          scopeToHousehold(recurringTransactions.householdId, householdId),
          inArray(recurringTransactions.categoryId, categoryIds)
        )
      )
      .limit(1),
  ]);

  return txn.length > 0 || recurring.length > 0;
}

export async function findBudgetIdForCategory(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  categoryId: string
): Promise<{ budgetId: string | null; matchSource: "mapping" | null }> {
  let currentId: string | null = categoryId;

  while (currentId) {
    const mapping = await db.query.budgetCategoryMappings.findFirst({
      where: and(
        eq(budgetCategoryMappings.categoryId, currentId),
        scopeToHousehold(budgetCategoryMappings.householdId, householdId)
      ),
    });

    if (mapping) {
      const budget = await db.query.budgets.findFirst({
        where: and(
          eq(budgets.id, mapping.budgetId),
          scopeToHousehold(budgets.householdId, householdId),
          isNull(budgets.deletedAt),
          visibleBudgetsCondition(viewerUserId)
        ),
      });
      if (budget) {
        return { budgetId: budget.id, matchSource: "mapping" };
      }
    }

    const category = await getFinancialCategoryById(db, householdId, currentId);
    currentId = category?.parentId ?? null;
  }

  return { budgetId: null, matchSource: null };
}

export async function resolveCategoryIdByName(
  db: DrizzleD1,
  householdId: string,
  name: string,
  type: "income" | "expense"
): Promise<FinancialCategory | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const matches = await db.query.financialCategories.findMany({
    where: and(
      scopeToHousehold(financialCategories.householdId, householdId),
      isNull(financialCategories.deletedAt),
      eq(financialCategories.archived, false),
      eq(financialCategories.type, type),
      sql`lower(${financialCategories.name}) = lower(${trimmed})`
    ),
  });

  if (matches.length === 0) return null;

  const subcategories = matches.filter((row) => row.parentId !== null);
  if (subcategories.length > 0) {
    return subcategories[0] ?? null;
  }

  return matches[0] ?? null;
}

export async function findDuplicateCategoryName(
  db: DrizzleD1,
  householdId: string,
  name: string,
  parentId: string | null,
  excludeId?: string
): Promise<FinancialCategory | null> {
  const trimmed = name.trim();
  const conditions = [
    scopeToHousehold(financialCategories.householdId, householdId),
    isNull(financialCategories.deletedAt),
    sql`lower(${financialCategories.name}) = lower(${trimmed})`,
    parentId
      ? eq(financialCategories.parentId, parentId)
      : isNull(financialCategories.parentId),
  ];

  if (excludeId) {
    conditions.push(sql`${financialCategories.id} != ${excludeId}`);
  }

  return (
    (await db.query.financialCategories.findFirst({
      where: and(...conditions),
    })) ?? null
  );
}

export async function validateCategoryParent(
  db: DrizzleD1,
  householdId: string,
  parentId: string,
  type: "income" | "expense"
): Promise<FinancialCategory> {
  const parent = await getFinancialCategoryById(db, householdId, parentId);
  if (!parent || parent.archived) {
    throw new ActionError("Parent category not found", "VALIDATION_ERROR");
  }
  if (parent.parentId) {
    throw new ActionError("Subcategories cannot have children", "VALIDATION_ERROR");
  }
  if (parent.type !== type) {
    throw new ActionError("Subcategory type must match parent", "VALIDATION_ERROR");
  }

  return parent;
}

export async function listCategoryBudgetMappings(
  db: DrizzleD1,
  householdId: string
): Promise<{ categoryId: string; budgetId: string | null }[]> {
  const categories = await db.query.financialCategories.findMany({
    where: and(
      scopeToHousehold(financialCategories.householdId, householdId),
      isNull(financialCategories.deletedAt),
      eq(financialCategories.archived, false),
      eq(financialCategories.type, "expense")
    ),
    orderBy: (category, { asc }) => [
      asc(category.sortOrder),
      asc(category.name),
    ],
  });

  const mappings = await db.query.budgetCategoryMappings.findMany({
    where: scopeToHousehold(budgetCategoryMappings.householdId, householdId),
  });
  const mappingByCategoryId = new Map(
    mappings.map((mapping) => [mapping.categoryId, mapping.budgetId])
  );

  return categories.map((category) => ({
    categoryId: category.id,
    budgetId: mappingByCategoryId.get(category.id) ?? null,
  }));
}

export async function upsertCategoryBudgetMappings(
  db: DrizzleD1,
  householdId: string,
  viewerUserId: string,
  rows: { categoryId: string; budgetId: string | null }[]
): Promise<void> {
  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  if (categoryIds.length !== rows.length) {
    throw new ActionError("Duplicate category mappings", "VALIDATION_ERROR");
  }

  const categories = await db.query.financialCategories.findMany({
    where: and(
      scopeToHousehold(financialCategories.householdId, householdId),
      inArray(financialCategories.id, categoryIds),
      isNull(financialCategories.deletedAt),
      eq(financialCategories.archived, false),
      eq(financialCategories.type, "expense")
    ),
  });

  if (categories.length !== categoryIds.length) {
    throw new ActionError("Unknown category in mappings", "VALIDATION_ERROR");
  }

  const budgetIds = [
    ...new Set(rows.map((row) => row.budgetId).filter((id): id is string => Boolean(id))),
  ];

  if (budgetIds.length > 0) {
    const foundBudgets = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          scopeToHousehold(budgets.householdId, householdId),
          inArray(budgets.id, budgetIds),
          isNull(budgets.deletedAt),
          visibleBudgetsCondition(viewerUserId)
        )
      );
    if (foundBudgets.length !== budgetIds.length) {
      throw new ActionError("Unknown or inaccessible budget", "VALIDATION_ERROR");
    }
  }

  const toInsert = rows.filter(
    (row): row is { categoryId: string; budgetId: string } => Boolean(row.budgetId)
  );

  const deleteMappings = db
    .delete(budgetCategoryMappings)
    .where(
      and(
        scopeToHousehold(budgetCategoryMappings.householdId, householdId),
        inArray(budgetCategoryMappings.categoryId, categoryIds)
      )
    );

  if (toInsert.length === 0) {
    await deleteMappings;
    return;
  }

  await db.batch([
    deleteMappings,
    db.insert(budgetCategoryMappings).values(
      toInsert.map((row) => ({
        householdId,
        categoryId: row.categoryId,
        budgetId: row.budgetId,
      }))
    ),
  ] as unknown as Parameters<typeof db.batch>[0]);
}

export async function resolveOrCreateImportCategory(
  db: DrizzleD1,
  householdId: string,
  name: string,
  type: "income" | "expense"
): Promise<FinancialCategory> {
  const existing = await resolveCategoryIdByName(db, householdId, name, type);
  if (existing) return existing;

  const trimmed = name.trim();
  const duplicate = await findDuplicateCategoryName(db, householdId, trimmed, null);
  if (duplicate) {
    if (duplicate.type === type) return duplicate;
    throw new ActionError(
      "Category name exists with a different type",
      "VALIDATION_ERROR"
    );
  }

  try {
    return await db
      .insert(financialCategories)
      .values({
        householdId,
        parentId: null,
        name: trimmed,
        type,
      })
      .returning()
      .get();
  } catch {
    const raced = await resolveCategoryIdByName(db, householdId, name, type);
    if (raced) return raced;
    throw new ActionError("Failed to resolve import category", "VALIDATION_ERROR");
  }
}
