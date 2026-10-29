import type { CurrencyCode, GroceryCategorySource } from "@amigo/db";
import {
  DEFAULT_GROCERY_CATEGORY,
  GROCERY_CATEGORY_CRITERIA,
  isGroceryCategory,
} from "@/app/lib/grocery-categories";
import {
  JEV_MODEL,
  askJevChoice,
  jevAi,
  logJevFallback,
  type JevChoiceInput,
} from "./jev";

export const GROCERY_CATEGORY_MODEL = JEV_MODEL;
export const GROCERY_CATEGORY_TIMEOUT_MS = 2500;
/** The retry after an add runs once the response is sent, so it can wait longer. */
export const GROCERY_CATEGORY_RETRY_TIMEOUT_MS = 10_000;
export const GROCERY_CATEGORY_MIN_CONFIDENCE = 0.5;
/** How long categorization waits for the household's currency before using the default store. */
const HOME_CURRENCY_WAIT_MS = 500;

/** What `load` gives if it settles within `ms`, else null; failures become null too. */
async function settleWithin<T>(load: () => T | Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(load)
        .catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Where the household shops, from its home currency, so Jev pictures the right store. */
const STORE_BY_CURRENCY: Partial<Record<CurrencyCode, string>> = {
  CAD: "a Canadian supermarket",
  COP: "a Colombian supermarket (such as Éxito, Carulla, D1, or Olímpica)",
  MXN: "a Mexican supermarket (such as Walmart, Soriana, or Chedraui)",
  USD: "an American supermarket",
  GBP: "a British supermarket",
  EUR: "a European supermarket",
};

export function aisleInstructions(homeCurrency?: CurrencyCode | null): string {
  const store = (homeCurrency && STORE_BY_CURRENCY[homeCurrency]) ?? STORE_BY_CURRENCY.CAD;
  return `Which aisle of ${store} is this item in? The name may be English, Spanish, or a mix of both.`;
}

export interface GroceryCategoryAi {
  run(
    model: string,
    input: JevChoiceInput,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

export function groceryCategoryAi(ai: Ai | undefined): GroceryCategoryAi | undefined {
  return jevAi(ai);
}

export interface GroceryCategoryDecision {
  category: string | null;
  /** False when `category` is the fallback because Jev did not choose an aisle. */
  decided: boolean;
  /**
   * "user" when an allowlisted `supplied` aisle was used.
   * "ai" for Jev's choice and for the fallback.
   */
  source: GroceryCategorySource;
}

/**
 * Returns the supplied category when it is allowlisted (`source` is "user"),
 * otherwise Jev's confident choice (`source` is "ai"). When Jev can't decide,
 * `decided` is false, `source` is "ai", and `category` is `fallback`
 * (General unless the caller passes something else).
 */
export async function categorizeGroceryItem(
  ai: GroceryCategoryAi | undefined,
  name: string,
  {
    supplied,
    fallback = DEFAULT_GROCERY_CATEGORY,
    homeCurrency,
    timeoutMs = GROCERY_CATEGORY_TIMEOUT_MS,
  }: {
    supplied?: string | null;
    fallback?: string | null;
    /** The household's currency, or a lookup run only if Jev is asked. */
    homeCurrency?: CurrencyCode | null | (() => Promise<CurrencyCode | null>);
    timeoutMs?: number;
  } = {}
): Promise<GroceryCategoryDecision> {
  const explicit = supplied?.trim();
  if (explicit && isGroceryCategory(explicit)) {
    return { category: explicit, decided: true, source: "user" };
  }
  if (!ai) {
    logJevFallback("grocery-category", "no_binding");
    return { category: fallback, decided: false, source: "ai" };
  }

  // A failed or slow currency lookup only costs Jev the store's country, not the answer.
  const instructions = aisleInstructions(
    await settleWithin(
      typeof homeCurrency === "function" ? homeCurrency : () => homeCurrency ?? null,
      HOME_CURRENCY_WAIT_MS
    )
  );
  const choice = await askJevChoice(ai, {
    context: "grocery-category",
    question: "aisle",
    state: name,
    instructions,
    criteria: { ...GROCERY_CATEGORY_CRITERIA },
    minConfidence: GROCERY_CATEGORY_MIN_CONFIDENCE,
    timeoutMs,
    redact: [name],
    logChoice: true,
  });
  if (!choice) return { category: fallback, decided: false, source: "ai" };
  return { category: choice.choice, decided: true, source: "ai" };
}
