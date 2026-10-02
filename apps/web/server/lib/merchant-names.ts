import type { CurrencyCode, DrizzleD1, UiLanguage } from "@amigo/db";
import { runWithinBudget } from "./ai-budget";

export const MERCHANT_NAME_MODEL = "@cf/zai-org/glm-5.3-flash";

const SYSTEM =
  "You name merchants from bank statement codes. For each input key, give the short name a person would use for that business: expand store codes to the real store or brand only when you know the merchant (RCSS is Real Canadian Superstore). Keep brand spelling. Never add a city, country, or store number. Set known to false and return the key in title case when you do not recognize the merchant; never guess. Generic words (not brand names) go in the requested language. Reply only with JSON.";

// A live probe took ~5 s for 8 keys, and latency grows with keys per call, so
// keep calls small and run them side by side within the preview's deadline.
const CHUNK_SIZE = 8;
const MAX_CHUNKS = 8;
const MAX_KEYS = CHUNK_SIZE * MAX_CHUNKS;
const DEFAULT_DEADLINE_MS = 10_000;

const NAME_ITEM = {
  type: "object",
  properties: {
    name: { type: "string" },
    known: { type: "boolean" },
  },
  required: ["name", "known"],
  additionalProperties: false,
} as const;

export const COUNTRY_BY_CURRENCY: Record<CurrencyCode, string> = {
  CAD: "Canada",
  USD: "United States",
  MXN: "Mexico",
  COP: "Colombia",
  GBP: "United Kingdom",
  EUR: "Europe",
};

interface MerchantNameAi {
  run(
    model: string,
    input: MerchantNameInput,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

interface MerchantNameInput {
  messages: { role: "system" | "user"; content: string }[];
  response_format: {
    type: "json_schema";
    json_schema: {
      type: "object";
      properties: Record<string, typeof NAME_ITEM>;
      required: string[];
      additionalProperties: false;
    };
  };
  max_tokens: number;
  reasoning_effort: "low";
}

export async function suggestMerchantNames(
  env: { AI?: Ai; AI_DAILY_NEURON_BUDGET?: string },
  db: DrizzleD1,
  keys: readonly string[],
  {
    language,
    homeCurrency,
    deadlineMs = DEFAULT_DEADLINE_MS,
  }: {
    language: UiLanguage;
    homeCurrency: CurrencyCode;
    deadlineMs?: number;
  }
): Promise<Map<string, string>> {
  const ai = merchantNameAi(env.AI);
  if (!ai) return new Map();
  const pending = distinct(keys).slice(0, MAX_KEYS);
  if (pending.length === 0) return new Map();

  const country = COUNTRY_BY_CURRENCY[homeCurrency] ?? "Canada";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const named = await mapPool(chunk(pending, CHUNK_SIZE), MAX_CHUNKS, (part) =>
      nameChunk(env, db, ai, part, language, country, controller.signal)
    );
    const names = new Map<string, string>();
    for (const part of named) {
      for (const [key, name] of part) names.set(key, name);
    }
    return names;
  } finally {
    clearTimeout(timer);
  }
}

function merchantNameAi(ai: Ai | undefined): MerchantNameAi | undefined {
  if (!ai) return undefined;
  const runner = ai as unknown as MerchantNameAi;
  return {
    run: (model, input, options) => runner.run(model, input, options),
  };
}

async function nameChunk(
  env: { AI_DAILY_NEURON_BUDGET?: string },
  db: DrizzleD1,
  ai: MerchantNameAi,
  keys: readonly string[],
  language: UiLanguage,
  country: string,
  signal: AbortSignal
): Promise<Map<string, string>> {
  const input = requestFor(keys, language, country);
  try {
    const outcome = await runWithinBudget(
      env,
      db,
      "merchant-names",
      3 * keys.length + 10,
      (chunkSignal) => {
        const inference = Promise.resolve(ai.run(MERCHANT_NAME_MODEL, input, { signal: chunkSignal }));
        return raceSignal(inference, chunkSignal);
      },
      neuronsUsed,
      { signal }
    );
    if (!outcome.ok) return new Map();
    return namesFromResponse(outcome.value, keys);
  } catch {
    logMerchantNames("error");
    return new Map();
  }
}

function requestFor(keys: readonly string[], language: UiLanguage, country: string): MerchantNameInput {
  const properties: Record<string, typeof NAME_ITEM> = {};
  for (const key of keys) properties[key] = NAME_ITEM;
  return {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify({ language, country, keys }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties,
        required: [...keys],
        additionalProperties: false,
      },
    },
    max_tokens: 1500,
    reasoning_effort: "low",
  };
}

function neuronsUsed(result: unknown): number | null {
  const neurons = field(field(result, "usage"), "neurons");
  return typeof neurons === "number" && Number.isFinite(neurons) ? neurons : null;
}

function namesFromResponse(response: unknown, keys: readonly string[]): Map<string, string> {
  const parsed = parsePayload(response);
  if (!parsed) {
    logMerchantNames("unrecognized_response");
    return new Map();
  }
  const requested = new Set(keys);
  const names = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    const name = acceptedName(key, value, requested);
    if (name) names.set(key, name);
  }
  return names;
}

function parsePayload(response: unknown): Record<string, unknown> | undefined {
  const text = contentText(response);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function contentText(response: unknown): string | undefined {
  const choices = field(response, "choices");
  if (Array.isArray(choices)) {
    const content = field(field(choices[0], "message"), "content");
    return typeof content === "string" ? content : undefined;
  }
  const legacy = field(response, "response");
  return typeof legacy === "string" ? legacy : undefined;
}

function acceptedName(key: string, value: unknown, requested: Set<string>): string | null {
  if (!requested.has(key)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { known?: unknown; name?: unknown };
  if (record.known !== true || typeof record.name !== "string") return null;
  const name = record.name.trim();
  if (name.length < 1 || name.length > 60) return null;
  if (!/\p{L}/u.test(name)) return null;
  // The key back unchanged adds nothing, except a short brand acronym (DAZN,
  // IKEA) that the cleaner would otherwise title-case.
  if (name.toLowerCase() === key.toLowerCase() && !isBrandAcronym(name)) return null;
  return name;
}

function isBrandAcronym(name: string): boolean {
  return /^[A-Z0-9&]{2,5}$/.test(name) && /[A-Z]/.test(name);
}

function distinct(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index]!);
      }
    })
  );
  return results;
}

function raceSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("aborted");
}

function logMerchantNames(reason: "unrecognized_response" | "error"): void {
  console.warn(JSON.stringify({ context: "merchant-names", reason }));
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
