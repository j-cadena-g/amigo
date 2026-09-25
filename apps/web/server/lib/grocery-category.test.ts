import { afterEach, describe, expect, it, vi } from "vitest";
import { categorizeGroceryItem } from "./grocery-category";

function jevChoice(choice: string, confidence: number) {
  return {
    answers: {
      aisle: { type: "choice", choice, confidence },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("categorizeGroceryItem", () => {
  it("stores a confident allowlisted choice", async () => {
    const run = vi.fn().mockResolvedValue(jevChoice("Dairy", 0.8));

    await expect(categorizeGroceryItem({ run }, "leche 2%")).resolves.toBe(
      "Dairy"
    );
    expect(run).toHaveBeenCalledOnce();
  });

  it("stores General when confidence is below 0.5", async () => {
    const run = vi.fn().mockResolvedValue(jevChoice("Produce", 0.49));

    await expect(categorizeGroceryItem({ run }, "aguacate")).resolves.toBe(
      "General"
    );
  });

  it("stores General for a missing or unknown choice", async () => {
    const missing = vi.fn().mockResolvedValue({ answers: {} });
    const unknown = vi.fn().mockResolvedValue(jevChoice("Deli", 0.9));

    await expect(categorizeGroceryItem({ run: missing }, "pan")).resolves.toBe(
      "General"
    );
    await expect(
      categorizeGroceryItem({ run: unknown }, "pan")
    ).resolves.toBe("General");
  });

  it("stores General when run throws", async () => {
    const run = vi.fn().mockRejectedValue(new Error("upstream"));

    await expect(categorizeGroceryItem({ run }, "pollo")).resolves.toBe(
      "General"
    );
  });

  it("stores General when run throws synchronously", async () => {
    const run = vi.fn(() => {
      throw new Error("sync");
    });

    await expect(categorizeGroceryItem({ run }, "pollo")).resolves.toBe(
      "General"
    );
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
  });

  it("skips run when the supplied category is allowlisted", async () => {
    const run = vi.fn();

    await expect(
      categorizeGroceryItem({ run }, "leche", "Dairy")
    ).resolves.toBe("Dairy");
    expect(run).not.toHaveBeenCalled();
  });
});
