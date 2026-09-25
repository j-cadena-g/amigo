import {
  DEFAULT_GROCERY_CATEGORY,
  GROCERY_CATEGORY_CRITERIA,
  isGroceryCategory,
} from "@/app/lib/grocery-categories";

export const GROCERY_CATEGORY_MODEL = "typesafe/jev";
export const GROCERY_CATEGORY_TIMEOUT_MS = 2500;
export const GROCERY_CATEGORY_MIN_CONFIDENCE = 0.5;

const AISLE_INSTRUCTIONS =
  "Which grocery aisle is this item? The name may be English, Spanish, or a mix of both.";

export interface GroceryCategoryAi {
  run(
    model: string,
    input: JevChoiceInput,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

export function groceryCategoryAi(
  ai: Ai | undefined
): GroceryCategoryAi | undefined {
  if (!ai) return undefined;
  const runner = ai as unknown as GroceryCategoryAi;
  return {
    run: (model, input, options) => runner.run(model, input, options),
  };
}

interface JevChoiceInput {
  state: string;
  questions: {
    aisle: {
      type: "choice";
      instructions: string;
      criteria: typeof GROCERY_CATEGORY_CRITERIA;
    };
  };
}

type FallbackReason =
  | "no_binding"
  | "timeout"
  | "error"
  | "unrecognized_response"
  | "unknown_choice"
  | "low_confidence";

// One JSON line per fallback, so a billing or response-shape problem shows up
// in Workers Logs. Never log the item name.
function logFallback(reason: FallbackReason, meta?: Record<string, unknown>) {
  console.warn(
    JSON.stringify({ context: "grocery-category", reason, ...meta, ts: Date.now() })
  );
}

export interface GroceryCategoryDecision {
  category: string | null;
  /** False when `category` is the fallback because Jev did not choose an aisle. */
  decided: boolean;
}

/**
 * Returns the supplied category when it is allowlisted, otherwise Jev's
 * confident choice. When Jev can't decide, `decided` is false and `category`
 * is `fallback` (General unless the caller passes something else).
 */
export async function categorizeGroceryItem(
  ai: GroceryCategoryAi | undefined,
  name: string,
  {
    supplied,
    fallback = DEFAULT_GROCERY_CATEGORY,
  }: { supplied?: string | null; fallback?: string | null } = {}
): Promise<GroceryCategoryDecision> {
  const explicit = supplied?.trim();
  if (explicit && isGroceryCategory(explicit)) {
    return { category: explicit, decided: true };
  }
  if (!ai) {
    logFallback("no_binding");
    return { category: fallback, decided: false };
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const inference = ai.run(
      GROCERY_CATEGORY_MODEL,
      {
        state: name,
        questions: {
          aisle: {
            type: "choice",
            instructions: AISLE_INSTRUCTIONS,
            criteria: GROCERY_CATEGORY_CRITERIA,
          },
        },
      },
      { signal: controller.signal }
    );
    void Promise.resolve(inference).catch(() => undefined);

    const response = await Promise.race([
      inference,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("grocery categorization timed out"));
        }, GROCERY_CATEGORY_TIMEOUT_MS);
      }),
    ]);
    const choice = choiceFromJev(response);
    if (choice === null) {
      return { category: fallback, decided: false };
    }
    return { category: choice, decided: true };
  } catch (error) {
    controller.abort();
    if (timedOut) {
      logFallback("timeout");
    } else {
      logFallback("error", { error: safeErrorText(error, name) });
    }
    return { category: fallback, decided: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function choiceFromJev(response: unknown): string | null {
  // The AI binding wraps third-party model output as
  // { state, result: { model, answers, usage }, gatewayMetadata }.
  const body = field(response, "result") ?? response;
  const aisle = field(field(body, "answers"), "aisle");
  if (!aisle || typeof aisle !== "object") {
    logFallback("unrecognized_response", { shape: responseShape(response) });
    return null;
  }
  const choice = field(aisle, "choice");
  const confidence = field(aisle, "confidence");
  if (typeof choice !== "string" || !isGroceryCategory(choice)) {
    logFallback("unknown_choice");
    return null;
  }
  if (
    typeof confidence !== "number" ||
    confidence < GROCERY_CATEGORY_MIN_CONFIDENCE
  ) {
    logFallback("low_confidence", { choice, confidence });
    return null;
  }
  return choice;
}

function responseShape(response: unknown): string {
  if (response === null) return "null";
  if (Array.isArray(response)) return "array";
  if (typeof response !== "object") return typeof response;
  const body = field(response, "result") ?? response;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "no_body";
  const answers = field(body, "answers");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return "no_answers";
  }
  return "no_aisle";
}

function safeErrorText(error: unknown, itemName: string): string {
  const message = error instanceof Error ? error.message : "rejected";
  const needle = itemName.trim();
  const redacted =
    needle.length >= 3 ? message.split(needle).join("[redacted]") : "rejected";
  return redacted.slice(0, 200);
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
