import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { computeLimitAmountHomeCents } from "./money";
import { getHomeCurrency } from "./household-currency";
import { getExchangeRateForRecord } from "./exchange-rates";

vi.mock("./household-currency", () => ({
  getHomeCurrency: vi.fn(),
}));

vi.mock("./exchange-rates", () => ({
  getExchangeRateForRecord: vi.fn(),
}));

describe("money", () => {
  beforeEach(() => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("computeLimitAmountHomeCents rejects invalid limit cents", async () => {
    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "household", Number.NaN, "USD")
    ).rejects.toThrow(/invalid limitCentsInBudgetCurrency/);

    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "household", -1, "USD")
    ).rejects.toThrow(/invalid limitCentsInBudgetCurrency/);

    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "household", 10.5, "USD")
    ).rejects.toThrow(/invalid limitCentsInBudgetCurrency/);
  });

  it("same currency returns input and does not call FX", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
    const r = await computeLimitAmountHomeCents({} as never, {} as never, "h", 500, "CAD");
    expect(r).toEqual({ limitAmountHome: 500, exchangeRateLimitToHome: null });
    expect(getExchangeRateForRecord).not.toHaveBeenCalled();
  });

  it("converts with FX rate", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(1.35);
    const r = await computeLimitAmountHomeCents({} as never, {} as never, "h", 1000, "USD");
    expect(r.limitAmountHome).toBe(1350);
    expect(r.exchangeRateLimitToHome).toBe(1.35);
  });

  it("forces at least 1 home cent when limit and rate would round to 0", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(0.0004);
    const r = await computeLimitAmountHomeCents({} as never, {} as never, "h", 1, "USD");
    expect(r.limitAmountHome).toBe(1);
  });

  it("zero limit stays zero", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("USD");
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(2);
    const r = await computeLimitAmountHomeCents({} as never, {} as never, "h", 0, "CAD");
    expect(r.limitAmountHome).toBe(0);
  });

  it("rejects missing rate when currencies differ", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(null);
    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "h", 100, "USD")
    ).rejects.toThrow(/Missing exchange rate/);
  });

  it("rejects non-finite or non-positive rate", async () => {
    vi.mocked(getHomeCurrency).mockResolvedValue("CAD");
    vi.mocked(getExchangeRateForRecord).mockResolvedValue(Number.NaN);
    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "h", 100, "USD")
    ).rejects.toThrow(/Invalid exchange rate/);

    vi.mocked(getExchangeRateForRecord).mockResolvedValue(0);
    await expect(
      computeLimitAmountHomeCents({} as never, {} as never, "h", 100, "USD")
    ).rejects.toThrow(/Invalid exchange rate/);
  });
});
