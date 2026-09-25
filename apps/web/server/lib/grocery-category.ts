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

export async function categorizeGroceryItem(
  ai: GroceryCategoryAi | undefined,
  name: string,
  supplied?: string | null
): Promise<string> {
  const explicit = supplied?.trim();
  if (explicit && isGroceryCategory(explicit)) {
    return explicit;
  }
  if (!ai) {
    return DEFAULT_GROCERY_CATEGORY;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
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
          controller.abort();
          reject(new Error("grocery categorization timed out"));
        }, GROCERY_CATEGORY_TIMEOUT_MS);
      }),
    ]);
    return choiceFromJev(response);
  } catch {
    controller.abort();
    return DEFAULT_GROCERY_CATEGORY;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function choiceFromJev(response: unknown): string {
  if (!response || typeof response !== "object") {
    return DEFAULT_GROCERY_CATEGORY;
  }
  const answers = (response as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") {
    return DEFAULT_GROCERY_CATEGORY;
  }
  const aisle = (answers as { aisle?: unknown }).aisle;
  if (!aisle || typeof aisle !== "object") {
    return DEFAULT_GROCERY_CATEGORY;
  }
  const choice = (aisle as { choice?: unknown }).choice;
  const confidence = (aisle as { confidence?: unknown }).confidence;
  if (typeof choice !== "string" || !isGroceryCategory(choice)) {
    return DEFAULT_GROCERY_CATEGORY;
  }
  if (
    typeof confidence !== "number" ||
    confidence < GROCERY_CATEGORY_MIN_CONFIDENCE
  ) {
    return DEFAULT_GROCERY_CATEGORY;
  }
  return choice;
}
