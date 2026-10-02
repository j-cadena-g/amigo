import {
  and,
  eq,
  financialCategories,
  isNull,
  scopeToHousehold,
  type CurrencyCode,
  type DrizzleD1,
} from "@amigo/db";
import { askJevChoice, jevAi, logJevFallback, type JevAi } from "./jev";
import {
  isUncategorizedCategoryName,
  logMerchantAliasFailure,
  upsertAiAlias,
} from "./merchant-aliases";
import { COUNTRY_BY_CURRENCY } from "./merchant-names";

export const TRANSACTION_CATEGORY_MIN_CONFIDENCE = 0.6;
export const TRANSACTION_CATEGORY_CONCURRENCY = 6;
export const TRANSACTION_CATEGORY_TIMEOUT_MS = 2500;

const CONTEXT = "transaction-category";
const QUESTION = "category";

export type TransactionCategoryRequest = {
  merchantKey: string;
  type: "income" | "expense";
  /** Name shown in the preview, after the AI rename. */
  displayName: string;
  /** The merchant key: cleaned bank text, never the raw description. */
  bankText: string | null;
};

export type TransactionCategorySuggestion = {
  categoryId: string;
  categoryName: string;
  type: "income" | "expense";
};

type CategoryRow = {
  id: string;
  name: string;
  type: "income" | "expense";
  parentId: string | null;
  description: string | null;
};

type ChoiceSet = {
  criteria: Record<string, string>;
  byLabel: Map<string, { id: string; name: string }>;
};

/**
 * Suggest a household category for each merchant that has none remembered.
 * Keyed by merchant key. A choice is returned only after it is saved as an
 * `ai` alias. Jev is billed in gateway credits, so this does not use the
 * neuron budget.
 */
export async function suggestTransactionCategories(
  env: { AI?: Ai },
  db: DrizzleD1,
  householdId: string,
  requests: readonly TransactionCategoryRequest[],
  options: { homeCurrency: CurrencyCode; deadlineMs: number }
): Promise<Map<string, TransactionCategorySuggestion>> {
  if (requests.length === 0) return new Map();
  const ai = jevAi(env.AI);
  if (!ai) {
    logJevFallback(CONTEXT, "no_binding");
    return new Map();
  }
  if (options.deadlineMs <= 0) return new Map();

  const pending = dedupe(requests);
  const choices = choicesByType(await loadCategories(db, householdId));
  const runnable = pending.filter((request) => usable(choices.get(request.type)));
  if (runnable.length === 0) return new Map();

  const country = COUNTRY_BY_CURRENCY[options.homeCurrency] ?? "Canada";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.deadlineMs);
  const found = new Map<string, TransactionCategorySuggestion>();
  try {
    await mapPool(runnable, TRANSACTION_CATEGORY_CONCURRENCY, async (request) => {
      if (controller.signal.aborted) return;
      const set = choices.get(request.type);
      if (!usable(set)) return;
      const suggestion = await suggestOne(
        ai,
        db,
        householdId,
        request,
        set,
        country,
        controller.signal
      );
      if (suggestion) found.set(request.merchantKey, suggestion);
    });
    return found;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCategories(db: DrizzleD1, householdId: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: financialCategories.id,
      name: financialCategories.name,
      type: financialCategories.type,
      parentId: financialCategories.parentId,
      description: financialCategories.description,
    })
    .from(financialCategories)
    .where(
      and(
        scopeToHousehold(financialCategories.householdId, householdId),
        isNull(financialCategories.deletedAt),
        eq(financialCategories.archived, false)
      )
    );
}

function choicesByType(rows: readonly CategoryRow[]): Map<"income" | "expense", ChoiceSet> {
  const live = new Map(rows.map((row) => [row.id, row]));
  const byType = new Map<"income" | "expense", ChoiceSet>();
  for (const row of rows) {
    const label = labelFor(row, live);
    if (!label) continue;
    let set = byType.get(row.type);
    if (!set) {
      set = { criteria: {}, byLabel: new Map() };
      byType.set(row.type, set);
    }
    if (set.byLabel.has(label)) continue;
    const description = row.description?.trim();
    set.criteria[label] = description ? description : row.name;
    set.byLabel.set(label, { id: row.id, name: row.name });
  }
  return byType;
}

function labelFor(row: CategoryRow, live: ReadonlyMap<string, CategoryRow>): string | null {
  if (row.parentId) {
    const parent = live.get(row.parentId);
    // An archived or deleted parent is not in the live set, so the child is skipped.
    if (!parent) return null;
    return `${parent.name} › ${row.name}`;
  }
  if (isUncategorizedCategoryName(row.name)) return null;
  return row.name;
}

function usable(set: ChoiceSet | undefined): set is ChoiceSet {
  return Boolean(set && set.byLabel.size >= 2);
}

function dedupe(requests: readonly TransactionCategoryRequest[]): TransactionCategoryRequest[] {
  const seen = new Set<string>();
  const unique: TransactionCategoryRequest[] = [];
  for (const request of requests) {
    if (seen.has(request.merchantKey)) continue;
    seen.add(request.merchantKey);
    unique.push(request);
  }
  return unique;
}

function stateFor(displayName: string, bankText: string | null): string {
  if (!bankText?.trim()) return displayName;
  if (comparable(displayName) === comparable(bankText)) return displayName;
  return `${displayName}\nBank text: ${bankText}`;
}

function comparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function instructionsFor(type: "income" | "expense", country: string): string {
  if (type === "income") {
    return `Which of this household's income categories does this deposit belong in? The household is in ${country}. The name may be English, Spanish, or a mix of both.`;
  }
  return `Which of this household's spending categories does this card or bank transaction belong in? The household is in ${country}. The merchant name may be English, Spanish, or a mix of both.`;
}

async function suggestOne(
  ai: JevAi,
  db: DrizzleD1,
  householdId: string,
  request: TransactionCategoryRequest,
  set: ChoiceSet,
  country: string,
  signal: AbortSignal
): Promise<TransactionCategorySuggestion | null> {
  if (signal.aborted) return null;
  const answer = await askJevChoice(ai, {
    context: CONTEXT,
    question: QUESTION,
    state: stateFor(request.displayName, request.bankText),
    instructions: instructionsFor(request.type, country),
    criteria: set.criteria,
    minConfidence: TRANSACTION_CATEGORY_MIN_CONFIDENCE,
    timeoutMs: TRANSACTION_CATEGORY_TIMEOUT_MS,
    signal,
    // An error can echo the request, and categories are household text too.
    redact: [
      request.displayName,
      request.bankText ?? "",
      ...Object.keys(set.criteria),
      ...Object.values(set.criteria),
    ],
    logChoice: false,
  });
  if (!answer || signal.aborted) return null;
  const category = set.byLabel.get(answer.choice);
  if (!category) return null;
  try {
    const written = await upsertAiAlias(db, householdId, request.merchantKey, {
      categoryId: category.id,
    });
    if (!written) return null;
    return {
      categoryId: category.id,
      categoryName: category.name,
      type: request.type,
    };
  } catch {
    logMerchantAliasFailure();
    return null;
  }
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item === undefined) return;
        try {
          await run(item);
        } catch {
          // One merchant must not cancel the others.
        }
      }
    })
  );
}
