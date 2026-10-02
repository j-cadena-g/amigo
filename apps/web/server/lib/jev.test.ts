import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJevChoice, type JevAi } from "./jev";

const CRITERIA = {
  Groceries: "Supermarkets and grocery stores.",
  "Living expenses › Gas": "Fuel for the car.",
};

function envelope(choice: string, confidence: number) {
  return {
    state: "Completed",
    result: {
      model: "jev-1.13.0",
      answers: {
        category: {
          type: "choice",
          choice,
          probabilities: { [choice]: confidence },
          confidence,
        },
      },
      usage: { input_tokens: 549, output_tokens: 83 },
    },
  };
}

function ask(
  ai: JevAi,
  overrides: Partial<Parameters<typeof askJevChoice>[1]> = {}
) {
  return askJevChoice(ai, {
    context: "transaction-category",
    question: "category",
    state: "ZEBRA-MERCHANT",
    instructions: "Pick one.",
    criteria: CRITERIA,
    minConfidence: 0.6,
    timeoutMs: 2500,
    redact: ["ZEBRA-MERCHANT"],
    ...overrides,
  });
}

function warnings(): string[] {
  return vi.mocked(console.warn).mock.calls.map(([line]) => String(line));
}

function loggedReasons() {
  return warnings().map((line) => (JSON.parse(line) as { reason: string }).reason);
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("askJevChoice", () => {
  it("reads a confident criteria key from the binding envelope", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Living expenses › Gas", 0.92));

    await expect(ask({ run })).resolves.toEqual({
      choice: "Living expenses › Gas",
      confidence: 0.92,
    });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toBe("typesafe/jev");
    expect(run.mock.calls[0]?.[1]).toMatchObject({
      state: "ZEBRA-MERCHANT",
      questions: { category: { type: "choice", criteria: CRITERIA } },
    });
    expect(loggedReasons()).toEqual([]);
  });

  it("also reads an unwrapped response body", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Groceries", 0.8).result);

    await expect(ask({ run })).resolves.toEqual({ choice: "Groceries", confidence: 0.8 });
  });

  it("rejects an unknown choice without logging it", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Hardware", 0.9));

    await expect(ask({ run })).resolves.toBeNull();
    expect(loggedReasons()).toEqual(["unknown_choice"]);
    expect(warnings().join("\n")).not.toContain("Hardware");
  });

  it("logs low confidence without the choice unless logChoice is set", async () => {
    const hidden = vi.fn().mockResolvedValue(envelope("Groceries", 0.41));
    await expect(ask({ run: hidden })).resolves.toBeNull();
    const quiet = JSON.parse(warnings()[0] ?? "{}") as { choice?: string; confidence?: number };
    expect(quiet.confidence).toBe(0.41);
    expect(quiet).not.toHaveProperty("choice");

    const shown = vi.fn().mockResolvedValue(envelope("Groceries", 0.41));
    await expect(ask({ run: shown }, { logChoice: true })).resolves.toBeNull();
    expect(JSON.parse(warnings()[1] ?? "{}")).toMatchObject({
      reason: "low_confidence",
      choice: "Groceries",
      confidence: 0.41,
    });
  });

  it("aborts the inference when the call times out", async () => {
    vi.useFakeTimers();
    const run = vi.fn(
      (_model: string, _input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        })
    );
    const pending = ask({ run }, { timeoutMs: 2500 });

    await vi.advanceTimersByTimeAsync(2500);

    await expect(pending).resolves.toBeNull();
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    expect(loggedReasons()).toEqual(["timeout"]);
  });

  it("does not call the model when the external signal is already aborted", async () => {
    const signal = AbortSignal.abort();
    const run = vi.fn();

    await expect(ask({ run }, { signal })).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(loggedReasons()).toEqual(["deadline"]);
  });

  it("logs deadline when the external signal aborts mid-call", async () => {
    const controller = new AbortController();
    const run = vi.fn(
      (_model: string, _input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted ZEBRA-MERCHANT"));
          });
        })
    );
    const pending = ask({ run }, { signal: controller.signal, timeoutMs: 10_000 });
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(loggedReasons()).toEqual(["deadline"]);
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  });

  it("redacts every needle, and a short needle replaces the whole message", async () => {
    const many = vi.fn().mockRejectedValue(new Error("Acme and Acme paid in London"));
    await expect(
      ask({ run: many }, { redact: ["Acme", "London"], state: "Acme" })
    ).resolves.toBeNull();
    const line = warnings()[0] ?? "";
    expect(JSON.parse(line)).toMatchObject({
      reason: "error",
      error: "[redacted] and [redacted] paid in [redacted]",
    });
    expect(line).not.toContain("Acme");
    expect(line).not.toContain("London");

    const short = vi.fn().mockRejectedValue(new Error("ok failed for xy"));
    await expect(ask({ run: short }, { redact: ["ok", "xy"] })).resolves.toBeNull();
    expect(JSON.parse(warnings()[1] ?? "{}")).toMatchObject({ error: "rejected" });
    expect(warnings()[1]).not.toContain("ok");
  });

  it("never logs the merchant text", async () => {
    const unrecognized = vi.fn().mockResolvedValue({ state: "ZEBRA-MERCHANT", questions: {} });
    const unknown = vi.fn().mockResolvedValue(envelope("Hardware", 0.99));
    const low = vi.fn().mockResolvedValue(envelope("Groceries", 0.2));
    const failing = vi
      .fn()
      .mockRejectedValue(new Error("upstream failed for ZEBRA-MERCHANT"));

    await ask({ run: unrecognized });
    await ask({ run: unknown });
    await ask({ run: low });
    await ask({ run: failing });

    const logged = warnings().join("\n");
    expect(logged).not.toContain("ZEBRA-MERCHANT");
    expect(logged).not.toContain("Hardware");
    expect(logged).not.toContain('"state"');
    expect(loggedReasons()).toEqual([
      "unrecognized_response",
      "unknown_choice",
      "low_confidence",
      "error",
    ]);
    expect(JSON.parse(warnings()[0] ?? "{}")).toMatchObject({ shape: "no_answers" });
  });
});
