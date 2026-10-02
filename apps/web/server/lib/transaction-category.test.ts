import type { DrizzleD1 } from "@amigo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logMerchantAliasFailure, upsertAiAlias } from "./merchant-aliases";
import {
  suggestTransactionCategories,
  type TransactionCategoryRequest,
} from "./transaction-category";

vi.mock("./merchant-aliases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./merchant-aliases")>();
  return {
    ...actual,
    upsertAiAlias: vi.fn(async () => true),
    logMerchantAliasFailure: vi.fn(),
  };
});

type CategoryRow = {
  id: string;
  name: string;
  type: "income" | "expense";
  parentId: string | null;
  description: string | null;
};

const LIVING: CategoryRow = {
  id: "living",
  name: "Living expenses",
  type: "expense",
  parentId: null,
  description: "  Home costs  ",
};
const GAS: CategoryRow = {
  id: "gas",
  name: "Gas",
  type: "expense",
  parentId: "living",
  description: null,
};
const GROCERIES: CategoryRow = {
  id: "groceries",
  name: "Groceries",
  type: "expense",
  parentId: null,
  description: "",
};
const UNCATEGORIZED: CategoryRow = {
  id: "uncat",
  name: "Uncategorized",
  type: "expense",
  parentId: null,
  description: "Should stay out",
};
const GHOST: CategoryRow = {
  id: "ghost",
  name: "Ghost",
  type: "expense",
  parentId: "missing-parent",
  description: "Orphan",
};
const SALARY: CategoryRow = {
  id: "salary",
  name: "Salary",
  type: "income",
  parentId: null,
  description: "Pay",
};
const BONUS: CategoryRow = {
  id: "bonus",
  name: "Bonus",
  type: "income",
  parentId: null,
  description: null,
};

const EXPENSE_ROWS = [LIVING, GAS, GROCERIES, UNCATEGORIZED, GHOST];

function envelope(choice: string, confidence: number) {
  return {
    state: "Completed",
    result: {
      model: "jev-1.13.0",
      answers: {
        category: { type: "choice", choice, probabilities: {}, confidence },
      },
      usage: { input_tokens: 549, output_tokens: 83 },
    },
  };
}

function categoryDb(rows: CategoryRow[]): DrizzleD1 {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as DrizzleD1;
}

function request(
  overrides: Partial<TransactionCategoryRequest> = {}
): TransactionCategoryRequest {
  return {
    merchantKey: "SHELL",
    type: "expense",
    displayName: "Shell",
    bankText: "SHELL",
    ...overrides,
  };
}

function jevInput(run: ReturnType<typeof vi.fn>, index = 0) {
  return run.mock.calls[index]?.[1] as {
    state: string;
    questions: {
      category: { instructions: string; criteria: Record<string, string> };
    };
  };
}

function warnings(): string[] {
  return vi.mocked(console.warn).mock.calls.map(([line]) => String(line));
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(upsertAiAlias).mockReset();
  vi.mocked(upsertAiAlias).mockResolvedValue(true);
  vi.mocked(logMerchantAliasFailure).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("suggestTransactionCategories", () => {
  it("saves a confident choice and returns the category's own name", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Living expenses › Gas", 0.93));
    const db = categoryDb(EXPENSE_ROWS);

    const result = await suggestTransactionCategories({ AI: { run } as unknown as Ai }, db, "hh-1", [request()], {
      homeCurrency: "CAD",
      deadlineMs: 5_000,
    });

    expect(result.get("SHELL")).toEqual({
      categoryId: "gas",
      categoryName: "Gas",
      type: "expense",
    });
    expect(upsertAiAlias).toHaveBeenCalledWith(db, "hh-1", "SHELL", { categoryId: "gas" });
    const criteria = jevInput(run).questions.category.criteria;
    expect(criteria).toMatchObject({
      "Living expenses": "Home costs",
      "Living expenses › Gas": "Gas",
      Groceries: "Groceries",
    });
    expect(criteria).not.toHaveProperty("Uncategorized");
    expect(JSON.stringify(criteria)).not.toContain("Ghost");
    expect(JSON.stringify(criteria)).not.toContain("Should stay out");
  });

  it("saves nothing when confidence is low or the choice is unknown", async () => {
    const low = vi.fn().mockResolvedValue(envelope("Groceries", 0.59));
    const unknown = vi.fn().mockResolvedValue(envelope("Hardware", 0.99));
    const db = categoryDb(EXPENSE_ROWS);

    await expect(
      suggestTransactionCategories({ AI: { run: low } as unknown as Ai }, db, "hh-1", [request()], {
        homeCurrency: "CAD",
        deadlineMs: 5_000,
      })
    ).resolves.toEqual(new Map());
    await expect(
      suggestTransactionCategories({ AI: { run: unknown } as unknown as Ai }, db, "hh-1", [request({ merchantKey: "OTHER" })], {
        homeCurrency: "CAD",
        deadlineMs: 5_000,
      })
    ).resolves.toEqual(new Map());
    expect(upsertAiAlias).not.toHaveBeenCalled();
    const lowLog = JSON.parse(warnings()[0] ?? "{}") as { choice?: string; confidence?: number };
    expect(lowLog.confidence).toBe(0.59);
    expect(lowLog).not.toHaveProperty("choice");
    expect(warnings().join("\n")).not.toContain("Groceries");
    expect(warnings().join("\n")).not.toContain("Hardware");
  });

  it("asks each type only about its own labels", async () => {
    const run = vi.fn(async (_model: string, input: { state: string }) => {
      if (input.state.startsWith("Payroll")) return envelope("Groceries", 0.99);
      return envelope("Groceries", 0.9);
    });
    const db = categoryDb([...EXPENSE_ROWS, SALARY, BONUS]);

    const result = await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      db,
      "hh-1",
      [
        request({ merchantKey: "PAY", type: "income", displayName: "Payroll", bankText: "PAY" }),
        request(),
      ],
      { homeCurrency: "COP", deadlineMs: 5_000 }
    );

    expect(result.has("PAY")).toBe(false);
    expect(result.get("SHELL")).toEqual({
      categoryId: "groceries",
      categoryName: "Groceries",
      type: "expense",
    });
    const income = jevInput(run, 0);
    const expense = jevInput(run, 1);
    expect(Object.keys(income.questions.category.criteria)).toEqual(["Salary", "Bonus"]);
    expect(income.questions.category.instructions).toBe(
      "Which of this household's income categories does this deposit belong in? The household is in Colombia. The name may be English, Spanish, or a mix of both."
    );
    expect(expense.questions.category.instructions).toContain("spending categories");
    expect(expense.questions.category.instructions).toContain("Colombia");
    expect(Object.keys(expense.questions.category.criteria)).not.toContain("Salary");
    expect(Object.keys(income.questions.category.criteria)).not.toContain("Groceries");
    expect(upsertAiAlias).toHaveBeenCalledTimes(1);
    expect(upsertAiAlias).toHaveBeenCalledWith(db, "hh-1", "SHELL", { categoryId: "groceries" });
  });

  it("builds state from the display name and adds bank text only when it differs", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Groceries", 0.9));
    const db = categoryDb(EXPENSE_ROWS);
    await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      db,
      "hh-1",
      [
        request({ merchantKey: "SAME", displayName: "Shell Gas", bankText: "shell   gas" }),
        request({ merchantKey: "DIFF", displayName: "Shell", bankText: "SHELL STATION" }),
        request({ merchantKey: "NONE", displayName: "Shell", bankText: null }),
        request({ merchantKey: "BLANK", displayName: "Shell", bankText: "   " }),
      ],
      { homeCurrency: "USD", deadlineMs: 5_000 }
    );

    expect(run.mock.calls.map((call) => (call[1] as { state: string }).state)).toEqual([
      "Shell Gas",
      "Shell\nBank text: SHELL STATION",
      "Shell",
      "Shell",
    ]);
    expect(jevInput(run).questions.category.instructions).toContain("United States");
  });

  it("keeps the first request for a merchant key", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Groceries", 0.9));
    await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb(EXPENSE_ROWS),
      "hh-1",
      [
        request({ displayName: "First" }),
        request({ displayName: "Second", bankText: "OTHER" }),
      ],
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    expect(run).toHaveBeenCalledOnce();
    expect(jevInput(run).state).toBe("First\nBank text: SHELL");
  });

  it("does not call the model for fewer than two candidates", async () => {
    const run = vi.fn();
    const result = await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb([GROCERIES, UNCATEGORIZED, SALARY]),
      "hh-1",
      [request(), request({ merchantKey: "PAY", type: "income", displayName: "Payroll" })],
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    expect(result.size).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(upsertAiAlias).not.toHaveBeenCalled();
  });

  it("drops a duplicate whose first type cannot be categorized", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Groceries", 0.9));
    await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb([...EXPENSE_ROWS, SALARY]),
      "hh-1",
      [
        request({ type: "income", displayName: "Payroll" }),
        request({ type: "expense", displayName: "Shell" }),
      ],
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves a suggestion out when the alias is not written", async () => {
    const run = vi.fn().mockResolvedValue(envelope("Groceries", 0.9));
    vi.mocked(upsertAiAlias).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("write failed SHELL"));
    const db = categoryDb(EXPENSE_ROWS);
    const env = { AI: { run } as unknown as Ai };

    await expect(
      suggestTransactionCategories(env, db, "hh-1", [request()], {
        homeCurrency: "CAD",
        deadlineMs: 5_000,
      })
    ).resolves.toEqual(new Map());
    await expect(
      suggestTransactionCategories(env, db, "hh-1", [request({ merchantKey: "OTHER", displayName: "Other" })], {
        homeCurrency: "CAD",
        deadlineMs: 5_000,
      })
    ).resolves.toEqual(new Map());
    expect(logMerchantAliasFailure).toHaveBeenCalledOnce();
    expect(warnings().join("\n")).not.toContain("SHELL");
  });

  it("keeps going when one merchant's call throws", async () => {
    const run = vi.fn(async (_model: string, input: { state: string }) => {
      if (input.state.startsWith("Bad")) throw new Error("upstream Bad Shop");
      return envelope("Groceries", 0.91);
    });
    const result = await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb(EXPENSE_ROWS),
      "hh-1",
      [
        request({ merchantKey: "BAD", displayName: "Bad Shop", bankText: "BAD" }),
        request(),
      ],
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    expect(result.get("SHELL")?.categoryId).toBe("groceries");
    expect(result.has("BAD")).toBe(false);
    expect(warnings().join("\n")).not.toContain("Bad Shop");
  });

  it("keeps category names and descriptions out of error logs", async () => {
    const run = vi.fn(async () => {
      throw new Error("bad input: Home costs, Living expenses › Gas, Groceries");
    });
    await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb(EXPENSE_ROWS),
      "hh-1",
      [request()],
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    const logged = warnings().join("\n");
    expect(logged).toContain("bad input");
    expect(logged).not.toContain("Home costs");
    expect(logged).not.toContain("Groceries");
    expect(logged).not.toContain("Gas");
  });

  it("never runs more than six calls at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve(envelope("Groceries", 0.9));
          }, 20);
        })
    );
    const requests = Array.from({ length: 8 }, (_, index) =>
      request({ merchantKey: `M${index}`, displayName: `Store ${index}`, bankText: `M${index}` })
    );
    const result = await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb(EXPENSE_ROWS),
      "hh-1",
      requests,
      { homeCurrency: "CAD", deadlineMs: 5_000 }
    );
    expect(maxInFlight).toBe(6);
    expect(run).toHaveBeenCalledTimes(8);
    expect(result.size).toBe(8);
  });

  it("drops in-flight results and does not start the rest after the deadline", async () => {
    let started = 0;
    const run = vi.fn(
      (_model: string, _input: unknown, options?: { signal?: AbortSignal }) => {
        started += 1;
        return new Promise((resolve, reject) => {
          const finish = () => resolve(envelope("Groceries", 0.95));
          if (started === 1) {
            finish();
            return;
          }
          options?.signal?.addEventListener("abort", () => {
            finish();
            reject(new Error("aborted"));
          });
        });
      }
    );
    const requests = Array.from({ length: 8 }, (_, index) =>
      request({ merchantKey: `M${index}`, displayName: `Store ${index}`, bankText: `M${index}` })
    );
    const startedAt = Date.now();
    const result = await suggestTransactionCategories(
      { AI: { run } as unknown as Ai },
      categoryDb(EXPENSE_ROWS),
      "hh-1",
      requests,
      { homeCurrency: "CAD", deadlineMs: 200 }
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(started).toBe(7);
    expect(result.size).toBe(1);
    expect(upsertAiAlias).toHaveBeenCalledOnce();
    expect(run.mock.calls.length).toBe(started);
  });

  it("returns an empty map without a model call when it cannot run", async () => {
    const run = vi.fn();
    const select = vi.fn(() => ({
      from: () => ({ where: async () => EXPENSE_ROWS }),
    }));
    const db = { select } as unknown as DrizzleD1;
    const env = { AI: { run } as unknown as Ai };
    await expect(
      suggestTransactionCategories(env, db, "hh-1", [], { homeCurrency: "CAD", deadlineMs: 5_000 })
    ).resolves.toEqual(new Map());
    await expect(
      suggestTransactionCategories({ AI: undefined }, db, "hh-1", [request()], {
        homeCurrency: "CAD",
        deadlineMs: 5_000,
      })
    ).resolves.toEqual(new Map());
    await expect(
      suggestTransactionCategories(env, db, "hh-1", [request()], {
        homeCurrency: "CAD",
        deadlineMs: 0,
      })
    ).resolves.toEqual(new Map());
    expect(run).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(warnings().map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ context: "transaction-category", reason: "no_binding" }),
    ]);
  });
});
