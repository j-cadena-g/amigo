import {
  and,
  eq,
  financialCategories,
  inArray,
  isNull,
  merchantAliases,
  scopeToHousehold,
  type DrizzleD1,
  type MerchantAliasSource,
  type UiLanguage,
} from "@amigo/db";
import { cleanBankDescription } from "./bank-description";

/** household_id plus this many IN-list values stays under D1's 100-parameter limit. */
const IN_LIST_CHUNK = 80;

export type LoadedMerchantAlias = {
  displayName: string | null;
  categoryId: string | null;
  source: MerchantAliasSource;
};

export type UsableAliasCategory = {
  type: "income" | "expense";
  name: string;
};

export type MerchantAliasUpdate = {
  displayName?: string | null;
  categoryId?: string | null;
};

export type MerchantImportSuggestion = {
  merchantKey: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: "user" | "ai" | "none";
  nameSource: "user" | "ai" | "none";
};

export type MerchantLessonRow = {
  suggestedName: string | null;
  chosenName: string | null;
  suggestedCategoryId: string | null;
  chosenCategoryId: string | null;
};

export function isUncategorizedCategoryName(name: string | null | undefined): boolean {
  return name?.trim().toLowerCase() === "uncategorized";
}

export async function loadMerchantAliases(
  db: DrizzleD1,
  householdId: string,
  keys: string[]
): Promise<Map<string, LoadedMerchantAlias>> {
  const unique = [...new Set(keys.filter((key) => key.length > 0))];
  const aliases = new Map<string, LoadedMerchantAlias>();
  for (let i = 0; i < unique.length; i += IN_LIST_CHUNK) {
    const rows = await db
      .select({
        merchantKey: merchantAliases.merchantKey,
        displayName: merchantAliases.displayName,
        categoryId: merchantAliases.categoryId,
        source: merchantAliases.source,
      })
      .from(merchantAliases)
      .where(
        and(
          scopeToHousehold(merchantAliases.householdId, householdId),
          inArray(merchantAliases.merchantKey, unique.slice(i, i + IN_LIST_CHUNK))
        )
      );
    for (const row of rows) {
      aliases.set(row.merchantKey, {
        displayName: row.displayName,
        categoryId: row.categoryId,
        source: row.source,
      });
    }
  }
  return aliases;
}

export async function usableAliasCategoryIds(
  db: DrizzleD1,
  householdId: string,
  categoryIds: string[]
): Promise<Map<string, UsableAliasCategory>> {
  const unique = [...new Set(categoryIds.filter((id) => id.length > 0))];
  const categories = new Map<string, UsableAliasCategory>();
  for (let i = 0; i < unique.length; i += IN_LIST_CHUNK) {
    const rows = await db
      .select({
        id: financialCategories.id,
        type: financialCategories.type,
        name: financialCategories.name,
      })
      .from(financialCategories)
      .where(
        and(
          scopeToHousehold(financialCategories.householdId, householdId),
          inArray(financialCategories.id, unique.slice(i, i + IN_LIST_CHUNK)),
          isNull(financialCategories.deletedAt),
          eq(financialCategories.archived, false)
        )
      );
    for (const row of rows) {
      categories.set(row.id, { type: row.type, name: row.name });
    }
  }
  return categories;
}

export async function upsertUserAlias(
  db: DrizzleD1,
  householdId: string,
  merchantKey: string,
  patch: MerchantAliasUpdate
): Promise<void> {
  await upsertAlias(db, householdId, merchantKey, patch, "user");
}

export async function upsertAiAlias(
  db: DrizzleD1,
  householdId: string,
  merchantKey: string,
  patch: MerchantAliasUpdate
): Promise<void> {
  await upsertAlias(db, householdId, merchantKey, patch, "ai");
}

async function upsertAlias(
  db: DrizzleD1,
  householdId: string,
  merchantKey: string,
  patch: MerchantAliasUpdate,
  source: MerchantAliasSource
): Promise<void> {
  if (patch.displayName === undefined && patch.categoryId === undefined) return;
  const set: {
    source: MerchantAliasSource;
    updatedAt: Date;
    displayName?: string | null;
    categoryId?: string | null;
  } = { source, updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  await db
    .insert(merchantAliases)
    .values({
      householdId,
      merchantKey,
      displayName: patch.displayName ?? null,
      categoryId: patch.categoryId ?? null,
      source,
    })
    .onConflictDoUpdate({
      target: [merchantAliases.householdId, merchantAliases.merchantKey],
      set,
      // A user correction sticks. AI may refresh its own row only.
      ...(source === "ai" ? { setWhere: eq(merchantAliases.source, "ai") } : {}),
    });
}

export function applyMerchantAlias(input: {
  cleanedName: string | null;
  merchantKey: string | null;
  rowType: "income" | "expense";
  alias?: LoadedMerchantAlias | null;
  category?: UsableAliasCategory | null;
}): MerchantImportSuggestion {
  const aliasName = input.alias?.displayName?.trim() || null;
  const categoryApplied = Boolean(
    input.alias?.categoryId && input.category && input.category.type === input.rowType
  );
  return {
    merchantKey: input.merchantKey,
    description: aliasName ?? input.cleanedName,
    categoryId: categoryApplied ? input.alias!.categoryId : null,
    categoryName: categoryApplied ? input.category!.name : null,
    categorySource: categoryApplied ? input.alias!.source : "none",
    nameSource: aliasName && input.alias ? input.alias.source : "none",
  };
}

export async function suggestMerchantImportRows<
  T extends {
    bankDescription: string | null;
    description: string | null;
    type: "income" | "expense";
  },
>(
  db: DrizzleD1,
  householdId: string,
  rows: readonly T[],
  language: UiLanguage
): Promise<MerchantImportSuggestion[]> {
  const merchantKeys = rows.map((row) => merchantKeyFor(row.bankDescription, language));
  const aliases = await loadMerchantAliases(
    db,
    householdId,
    merchantKeys.filter((key): key is string => key != null)
  );
  const categories = await usableAliasCategoryIds(
    db,
    householdId,
    [...aliases.values()].flatMap((alias) => (alias.categoryId ? [alias.categoryId] : []))
  );
  return rows.map((row, index) => {
    const merchantKey = merchantKeys[index] ?? null;
    const alias = merchantKey ? aliases.get(merchantKey) : undefined;
    return applyMerchantAlias({
      cleanedName: row.description,
      merchantKey,
      rowType: row.type,
      alias,
      category: alias?.categoryId ? categories.get(alias.categoryId) : undefined,
    });
  });
}

/** Majority value. A tie takes the value from the last row. */
export function lessonForMerchant(
  rows: readonly MerchantLessonRow[]
): MerchantAliasUpdate | null {
  if (rows.length === 0) return null;
  const patch: MerchantAliasUpdate = {};
  const winningName = chooseMajority(rows.map((row) => row.chosenName));
  const suggestedName = chooseMajority(rows.map((row) => row.suggestedName));
  if (winningName && winningName !== suggestedName) patch.displayName = winningName;
  const winningCategory = chooseMajority(rows.map((row) => row.chosenCategoryId));
  const suggestedCategory = chooseMajority(rows.map((row) => row.suggestedCategoryId));
  if (winningCategory && winningCategory !== suggestedCategory) {
    patch.categoryId = winningCategory;
  }
  if (patch.displayName === undefined && patch.categoryId === undefined) return null;
  return patch;
}

export async function learnMerchantAliasFromEdit(
  db: DrizzleD1,
  householdId: string,
  input: {
    bankDescription: string;
    language: UiLanguage;
    previousDescription: string | null;
    nextDescription: string | null;
    descriptionProvided: boolean;
    previousCategoryId: string | null;
    nextCategoryId: string | null;
    nextCategoryName: string | null;
    categoryProvided: boolean;
  }
): Promise<void> {
  const patch: MerchantAliasUpdate = {};
  if (
    input.descriptionProvided &&
    input.nextDescription &&
    input.nextDescription !== input.previousDescription
  ) {
    patch.displayName = input.nextDescription;
  }
  if (
    input.categoryProvided &&
    input.nextCategoryId &&
    input.nextCategoryId !== input.previousCategoryId &&
    !isUncategorizedCategoryName(input.nextCategoryName)
  ) {
    patch.categoryId = input.nextCategoryId;
  }
  if (patch.displayName === undefined && patch.categoryId === undefined) return;
  const merchantKey = merchantKeyFor(input.bankDescription, input.language);
  if (!merchantKey) return;
  await upsertUserAlias(db, householdId, merchantKey, patch);
}

/** One JSON line, with no merchant text. D1 errors can echo bound values. */
export function logMerchantAliasFailure(): void {
  console.warn(
    JSON.stringify({
      context: "merchant-aliases",
      reason: "upsert_failed",
      ts: Date.now(),
    })
  );
}

function merchantKeyFor(
  bankDescription: string | null,
  language: UiLanguage
): string | null {
  if (!bankDescription) return null;
  const merchantKey = cleanBankDescription(bankDescription, language).merchantKey.trim();
  return merchantKey || null;
}

function chooseMajority<T extends string | null>(values: readonly T[]): T | undefined {
  if (values.length === 0) return undefined;
  const stats = new Map<string, { value: T; count: number; lastIndex: number }>();
  values.forEach((value, index) => {
    const key = value === null ? "\0" : value;
    const current = stats.get(key);
    if (current) {
      current.count += 1;
      current.lastIndex = index;
    } else {
      stats.set(key, { value, count: 1, lastIndex: index });
    }
  });
  let best: { value: T; count: number; lastIndex: number } | undefined;
  for (const entry of stats.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.lastIndex > best.lastIndex)
    ) {
      best = entry;
    }
  }
  return best?.value;
}
