import { describe, expect, it } from "vitest";
import { getCreditCardSummary } from "./credit-card-summary";

describe("getCreditCardSummary", () => {
  it("aggregates credit cards in the home currency and excludes loans", () => {
    const summary = getCreditCardSummary([
      {
        type: "CREDIT_CARD",
        balanceInitial: 1_000_00,
        balanceCurrent: 700_00,
        currency: "CAD",
        exchangeRateToHome: null,
      },
      {
        type: "CREDIT_CARD",
        balanceInitial: 1_000_00,
        balanceCurrent: 500_00,
        currency: "USD",
        exchangeRateToHome: 1.4,
      },
      {
        type: "LOAN",
        balanceInitial: 20_000_00,
        balanceCurrent: 5_000_00,
        currency: "CAD",
        exchangeRateToHome: null,
      },
    ]);

    expect(summary).toEqual({
      cardCount: 2,
      totalLimitCents: 2_400_00,
      availableCreditCents: 1_400_00,
      usedCreditCents: 1_000_00,
      percentageUsed: 100 / 2.4,
    });
  });

  it("returns null when there are no credit cards", () => {
    expect(
      getCreditCardSummary([
        {
          type: "LOAN",
          balanceInitial: 10_000_00,
          balanceCurrent: 2_000_00,
          currency: "CAD",
          exchangeRateToHome: null,
        },
      ])
    ).toBeNull();
  });

  it("does not report negative utilization for overpaid cards", () => {
    expect(
      getCreditCardSummary([
        {
          type: "CREDIT_CARD",
          balanceInitial: 1_000_00,
          balanceCurrent: 1_100_00,
          currency: "CAD",
          exchangeRateToHome: null,
        },
      ])
    ).toMatchObject({
      availableCreditCents: 1_100_00,
      usedCreditCents: 0,
      percentageUsed: 0,
    });
  });
});
