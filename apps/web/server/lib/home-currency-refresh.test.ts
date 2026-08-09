import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeRateForRecord } from "./exchange-rates";
import { refreshHouseholdHomeCurrencyRates } from "./home-currency-refresh";

vi.mock("./exchange-rates", () => ({
  getExchangeRateForRecord: vi.fn(),
}));

type CurrencyRow = { currency: string };

function createMockDb(currenciesByTable: Record<string, CurrencyRow[]>) {
  const updates: Array<{ table: string; set: Record<string, unknown> }> = [];
  const batches: unknown[][] = [];

  function tableName(table: { [key: string]: unknown }): string {
    // drizzle table objects expose Symbol.toStringTag or we key by currency column identity
    if ("balanceInitial" in table) return "debts";
    if ("limitAmount" in table) return "budgets";
    if ("postedAt" in table || "externalId" in table) return "transactions";
    if ("archived" in table) return "financial_accounts";
    if ("balance" in table && !("archived" in table)) return "assets";
    return "unknown";
  }

  const db = {
    selectDistinct: (_fields: unknown) => ({
      from: (table: { [key: string]: unknown }) => ({
        where: () => ({
          all: async () => currenciesByTable[tableName(table)] ?? [],
        }),
      }),
    }),
    update: (table: { [key: string]: unknown }) => ({
      set: (set: Record<string, unknown>) => {
        const entry = { table: tableName(table), set };
        updates.push(entry);
        return {
          where: () => entry,
        };
      },
    }),
    batch: vi.fn(async (statements: unknown[]) => {
      batches.push(statements);
    }),
  };

  return { db, updates, batches };
}

describe("refreshHouseholdHomeCurrencyRates", () => {
  beforeEach(() => {
    vi.mocked(getExchangeRateForRecord).mockReset();
  });

  it("sets null FX when record currency matches new home and skips rate fetch", async () => {
    const { db, updates, batches } = createMockDb({
      financial_accounts: [{ currency: "USD" }],
      debts: [],
      assets: [],
      transactions: [],
      budgets: [{ currency: "USD" }],
    });

    await refreshHouseholdHomeCurrencyRates(
      {} as never,
      db as never,
      "hh-1",
      "USD"
    );

    expect(getExchangeRateForRecord).not.toHaveBeenCalled();
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "financial_accounts",
          set: expect.objectContaining({ exchangeRateToHome: null }),
        }),
        expect.objectContaining({
          table: "budgets",
          set: expect.objectContaining({ exchangeRateLimitToHome: null }),
        }),
      ])
    );
    expect(batches.length).toBe(1);
  });

  it("fetches rates and updates foreign-currency rows", async () => {
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(1.35);
    const { db, updates } = createMockDb({
      financial_accounts: [{ currency: "USD" }],
      debts: [{ currency: "EUR" }],
      assets: [],
      transactions: [{ currency: "USD" }],
      budgets: [{ currency: "USD" }],
    });

    await refreshHouseholdHomeCurrencyRates(
      {} as never,
      db as never,
      "hh-1",
      "CAD"
    );

    expect(getExchangeRateForRecord).toHaveBeenCalledWith(
      expect.anything(),
      "USD",
      "CAD"
    );
    expect(getExchangeRateForRecord).toHaveBeenCalledWith(
      expect.anything(),
      "EUR",
      "CAD"
    );

    const accountUpdate = updates.find(
      (u) => u.table === "financial_accounts" && u.set.exchangeRateToHome === 1.35
    );
    expect(accountUpdate).toBeTruthy();

    const budgetUpdate = updates.find(
      (u) => u.table === "budgets" && u.set.exchangeRateLimitToHome === 1.35
    );
    expect(budgetUpdate).toBeTruthy();
    expect(budgetUpdate?.set.limitAmountHome).toBeDefined();
  });

  it("fails the refresh when a required rate is missing", async () => {
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(null);
    const { db, batches } = createMockDb({
      financial_accounts: [{ currency: "USD" }],
      debts: [],
      assets: [],
      transactions: [],
      budgets: [],
    });

    await expect(
      refreshHouseholdHomeCurrencyRates({} as never, db as never, "hh-1", "CAD")
    ).rejects.toThrow(/Missing exchange rate/);

    expect(batches).toHaveLength(0);
  });

  it("fails the refresh when a rate is non-positive", async () => {
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(0);
    const { db, batches } = createMockDb({
      financial_accounts: [],
      debts: [],
      assets: [],
      transactions: [{ currency: "MXN" }],
      budgets: [],
    });

    await expect(
      refreshHouseholdHomeCurrencyRates({} as never, db as never, "hh-1", "CAD")
    ).rejects.toThrow(/Invalid exchange rate/);

    expect(batches).toHaveLength(0);
  });

  it("does nothing when there are no active rows", async () => {
    const { db, batches } = createMockDb({
      financial_accounts: [],
      debts: [],
      assets: [],
      transactions: [],
      budgets: [],
    });

    await refreshHouseholdHomeCurrencyRates(
      {} as never,
      db as never,
      "hh-1",
      "CAD"
    );

    expect(getExchangeRateForRecord).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
  });
});
