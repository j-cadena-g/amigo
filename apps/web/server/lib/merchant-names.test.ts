import type { CurrencyCode, DrizzleD1 } from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestMerchantNames } from "./merchant-names";

const SYSTEM =
  "You name merchants from bank statement codes. For each input key, give the short name a person would use for that business: expand store codes to the real store or brand only when you know the merchant (RCSS is Real Canadian Superstore). Keep brand spelling. Never add a city, country, or store number. Set known to false and return the key in title case when you do not recognize the merchant; never guess. Generic words (not brand names) go in the requested language. Reply only with JSON.";

function budgetDb(): DrizzleD1 {
  return {
    select: () => ({
      from: () => ({
        where: async () => [{ total: 0 }],
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  } as unknown as DrizzleD1;
}

function env(run: unknown) {
  return { AI: { run } as unknown as Ai, AI_DAILY_NEURON_BUDGET: "10000" };
}

function chat(content: string, neurons = 15.75) {
  return {
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 192, completion_tokens: 289, total_tokens: 481, neurons },
  };
}

function userPayload(input: unknown): { language: string; country: string; keys: string[] } {
  const messages = (input as { messages: { content: string }[] }).messages;
  return JSON.parse(messages[1]!.content) as { language: string; country: string; keys: string[] };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("suggestMerchantNames", () => {
  it("sends the probe request, including low reasoning effort and a per-key schema", async () => {
    const run = vi.fn().mockResolvedValue(chat("{}"));
    await suggestMerchantNames(env(run), budgetDb(), ["RCSS OXFORD"], {
      language: "en",
      homeCurrency: "CAD",
    });

    expect(run).toHaveBeenCalledOnce();
    const [model, input, options] = run.mock.calls[0] as [
      string,
      {
        messages: { role: string; content: string }[];
        response_format: unknown;
        max_tokens: number;
        reasoning_effort: string;
      },
      { signal?: AbortSignal },
    ];
    expect(model).toBe("@cf/zai-org/glm-5.3-flash");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(input.messages[0]).toEqual({ role: "system", content: SYSTEM });
    expect(input.max_tokens).toBe(1500);
    expect(input.reasoning_effort).toBe("low");
    expect(userPayload(input)).toEqual({
      language: "en",
      country: "Canada",
      keys: ["RCSS OXFORD"],
    });
    expect(input.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          "RCSS OXFORD": {
            type: "object",
            properties: {
              name: { type: "string" },
              known: { type: "boolean" },
            },
            required: ["name", "known"],
            additionalProperties: false,
          },
        },
        required: ["RCSS OXFORD"],
        additionalProperties: false,
      },
    });
  });

  it.each([
    ["CAD", "Canada"],
    ["USD", "United States"],
    ["MXN", "Mexico"],
    ["COP", "Colombia"],
    ["GBP", "United Kingdom"],
    ["EUR", "Europe"],
  ] as const)("names the country for %s", async (homeCurrency: CurrencyCode, country) => {
    const run = vi.fn().mockResolvedValue(chat("{}"));
    await suggestMerchantNames(env(run), budgetDb(), ["RCSS OXFORD"], {
      language: "es",
      homeCurrency,
    });
    expect(userPayload(run.mock.calls[0]?.[1])).toMatchObject({
      language: "es",
      country,
    });
  });

  it("parses the probe response", async () => {
    const content = JSON.stringify({
      "RCSS OXFORD": { known: true, name: "Real Canadian Superstore" },
      "DREW'S YIG": { known: true, name: "Your Independent Grocer" },
      "UBERONE CA/UBERONEMEMB": { known: true, name: "Uber One" },
    });
    const run = vi.fn().mockResolvedValue(chat(content));
    const names = await suggestMerchantNames(
      env(run),
      budgetDb(),
      ["RCSS OXFORD", "DREW'S YIG", "UBERONE CA/UBERONEMEMB"],
      { language: "en", homeCurrency: "CAD" }
    );
    expect(names).toEqual(
      new Map([
        ["RCSS OXFORD", "Real Canadian Superstore"],
        ["DREW'S YIG", "Your Independent Grocer"],
        ["UBERONE CA/UBERONEMEMB", "Uber One"],
      ])
    );
  });

  it("also reads a top-level response string", async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({ "RCSS OXFORD": { known: true, name: "Real Canadian Superstore" } }),
    });
    const names = await suggestMerchantNames(env(run), budgetDb(), ["RCSS OXFORD"], {
      language: "en",
      homeCurrency: "CAD",
    });
    expect(names).toEqual(new Map([["RCSS OXFORD", "Real Canadian Superstore"]]));
  });

  it("drops unknown, empty, overlong, digits-only, same-as-key, and unrequested names but keeps a brand acronym", async () => {
    const sixty = `A${"b".repeat(59)}`;
    const content = JSON.stringify({
      "RCSS OXFORD": { known: false, name: "Real Canadian Superstore" },
      "WAL-MART": { known: true, name: "wal-mart" },
      SHORT: { known: true, name: "   " },
      LONG: { known: true, name: "A".repeat(61) },
      DIGITS: { known: true, name: "404404" },
      BLANK: { known: true, name: "" },
      SIXTY: { known: true, name: `  ${sixty}  ` },
      OK: { known: true, name: "  Neighbourhood Market  " },
      OTHER: { known: true, name: "Someone Else" },
      DAZN: { known: true, name: "DAZN" },
    });
    const run = vi.fn().mockResolvedValue(chat(content));
    const names = await suggestMerchantNames(
      env(run),
      budgetDb(),
      ["RCSS OXFORD", "WAL-MART", "SHORT", "LONG", "DIGITS", "BLANK", "SIXTY", "OK", "DAZN"],
      { language: "en", homeCurrency: "CAD" }
    );
    expect([...names]).toEqual([
      ["SIXTY", sixty],
      ["OK", "Neighbourhood Market"],
      ["DAZN", "DAZN"],
    ]);
  });

  it("chunks keys by 8, skips the rest past 64, and keeps at most 8 in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let started = 0;
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const run = vi.fn(async (_model: string, input: unknown) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      started += 1;
      if (started >= 8) releaseGate();
      else await gate;
      inFlight -= 1;
      const keys = userPayload(input).keys;
      const content = Object.fromEntries(keys.map((key) => [key, { known: true, name: `Store ${key}` }]));
      return chat(JSON.stringify(content), 20);
    });
    const keys = Array.from({ length: 65 }, (_, index) => `m${String(index).padStart(2, "0")}`);
    const names = await suggestMerchantNames(env(run), budgetDb(), keys, {
      language: "en",
      homeCurrency: "CAD",
    });

    expect(run).toHaveBeenCalledTimes(8);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBe(8);
    const sent = run.mock.calls.flatMap((call) => userPayload(call[1]).keys);
    expect(sent).toHaveLength(64);
    expect(sent).not.toContain("m64");
    for (const call of run.mock.calls) expect(userPayload(call[1]).keys).toHaveLength(8);
    expect(names.size).toBe(64);
    expect(names.has("m64")).toBe(false);
    expect(names.get("m00")).toBe("Store m00");
  });

  it("aborts when the deadline passes and keeps chunks that already finished", async () => {
    const run = vi.fn(async (_model: string, input: unknown, options?: { signal?: AbortSignal }) => {
      const keys = userPayload(input).keys;
      if (keys[0] === "SLOW") {
        await new Promise((_resolve, reject) => {
          const fail = () => reject(new Error("aborted"));
          if (options?.signal?.aborted) fail();
          else options?.signal?.addEventListener("abort", fail, { once: true });
        });
      }
      const content = Object.fromEntries(keys.map((key) => [key, { known: true, name: `Store ${key}` }]));
      return chat(JSON.stringify(content));
    });
    const fast = Array.from({ length: 8 }, (_, index) => `FAST${index}`);
    const slow = ["SLOW", ...Array.from({ length: 7 }, (_, index) => `SLOW${index + 1}`)];
    const names = await suggestMerchantNames(env(run), budgetDb(), [...fast, ...slow], {
      language: "en",
      homeCurrency: "CAD",
      deadlineMs: 200,
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(names.size).toBe(8);
    expect(names.get("FAST0")).toBe("Store FAST0");
    expect(names.has("SLOW")).toBe(false);
    const slowCall = run.mock.calls.find((call) => userPayload(call[1]).keys[0] === "SLOW");
    expect(slowCall?.[2]).toMatchObject({ signal: expect.objectContaining({ aborted: true }) });
  });

  it("returns an empty map when AI is missing", async () => {
    const run = vi.fn();
    await expect(
      suggestMerchantNames({ AI: undefined, AI_DAILY_NEURON_BUDGET: "10000" }, budgetDb(), ["RCSS OXFORD"], {
        language: "en",
        homeCurrency: "CAD",
      })
    ).resolves.toEqual(new Map());
    expect(run).not.toHaveBeenCalled();
  });

  it("logs malformed content without the merchant text and yields nothing", async () => {
    const run = vi.fn().mockResolvedValue(chat("RCSS OXFORD is not json"));
    const names = await suggestMerchantNames(env(run), budgetDb(), ["RCSS OXFORD"], {
      language: "en",
      homeCurrency: "CAD",
    });
    expect(names).toEqual(new Map());
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      context: "merchant-names",
      reason: "unrecognized_response",
    });
    expect(line).not.toContain("RCSS");
  });
});
