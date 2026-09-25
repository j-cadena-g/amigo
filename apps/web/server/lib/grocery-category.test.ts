import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categorizeGroceryItem } from "./grocery-category";

// What the Workers AI binding returns for typesafe/jev (captured from a live
// call): the model's body sits under `result`.
function jevResponse(choice: string, confidence: number) {
  return {
    state: "Completed",
    result: {
      model: "jev-1.13.0",
      answers: {
        aisle: {
          type: "choice",
          choice,
          probabilities: { [choice]: confidence },
          confidence,
        },
      },
      usage: { input_tokens: 639, output_tokens: 107 },
    },
    gatewayMetadata: { keySource: "Unified" },
  };
}

function loggedReasons() {
  return vi
    .mocked(console.warn)
    .mock.calls.map(
      ([line]) => (JSON.parse(String(line)) as { reason: string }).reason
    );
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("categorizeGroceryItem", () => {
  it("stores a confident allowlisted choice from the binding's response", async () => {
    const run = vi.fn().mockResolvedValue(jevResponse("Dairy", 0.8));

    await expect(categorizeGroceryItem({ run }, "leche 2%")).resolves.toBe(
      "Dairy"
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toBe("typesafe/jev");
    expect(run.mock.calls[0]?.[1]).toMatchObject({ state: "leche 2%" });
    expect(loggedReasons()).toEqual([]);
  });

  it("also reads an unwrapped response body", async () => {
    const run = vi.fn().mockResolvedValue(jevResponse("Bakery", 0.98).result);

    await expect(categorizeGroceryItem({ run }, "pan")).resolves.toBe(
      "Bakery"
    );
  });

  it("stores General when confidence is below 0.5", async () => {
    const run = vi.fn().mockResolvedValue(jevResponse("Produce", 0.49));

    await expect(categorizeGroceryItem({ run }, "aguacate")).resolves.toBe(
      "General"
    );
    expect(loggedReasons()).toEqual(["low_confidence"]);
  });

  it("stores General for a missing or unknown choice", async () => {
    const missing = vi
      .fn()
      .mockResolvedValue({ state: "Completed", result: { answers: {} } });
    const unknown = vi.fn().mockResolvedValue(jevResponse("Deli", 0.9));

    await expect(categorizeGroceryItem({ run: missing }, "pan")).resolves.toBe(
      "General"
    );
    await expect(
      categorizeGroceryItem({ run: unknown }, "pan")
    ).resolves.toBe("General");
    expect(loggedReasons()).toEqual(["unrecognized_response", "unknown_choice"]);
  });

  it("stores General and logs the error, without the item name, when run throws", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new Error("2021: Insufficient AI Gateway credits"));

    await expect(categorizeGroceryItem({ run }, "pollo")).resolves.toBe(
      "General"
    );
    expect(loggedReasons()).toEqual(["error"]);
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(line).toContain("Insufficient AI Gateway credits");
    expect(line).not.toContain("pollo");
  });

  it("stores General when run throws synchronously", async () => {
    const run = vi.fn(() => {
      throw new Error("sync");
    });

    await expect(categorizeGroceryItem({ run }, "pollo")).resolves.toBe(
      "General"
    );
    expect(loggedReasons()).toEqual(["error"]);
  });

  it("stores General when the call times out and aborts the inference", async () => {
    vi.useFakeTimers();
    const run = vi.fn(
      (_model: string, _input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        })
    );
    const pending = categorizeGroceryItem({ run }, "jabón");

    await vi.advanceTimersByTimeAsync(2500);

    await expect(pending).resolves.toBe("General");
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    expect(loggedReasons()).toEqual(["timeout"]);
  });

  it("stores General without an AI binding", async () => {
    await expect(categorizeGroceryItem(undefined, "pan")).resolves.toBe(
      "General"
    );
    expect(loggedReasons()).toEqual(["no_binding"]);
  });

  it("returns the caller's fallback only when Jev can't decide", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("upstream"));
    const confident = vi.fn().mockResolvedValue(jevResponse("Frozen", 0.99));

    await expect(
      categorizeGroceryItem({ run: failing }, "leche 2%", { fallback: "Dairy" })
    ).resolves.toBe("Dairy");
    await expect(
      categorizeGroceryItem({ run: confident }, "helado", { fallback: "Bakery" })
    ).resolves.toBe("Frozen");
  });

  it("skips run when the supplied category is allowlisted", async () => {
    const run = vi.fn();

    await expect(
      categorizeGroceryItem({ run }, "leche", { supplied: "Dairy" })
    ).resolves.toBe("Dairy");
    expect(run).not.toHaveBeenCalled();
  });
});
