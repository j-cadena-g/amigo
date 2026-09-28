import { describe, expect, it } from "vitest";
import { summarizeAccounts, sumBalancesHomeCents, type SummaryAccount } from "./account-summary";

function account(overrides: Partial<SummaryAccount> & Pick<SummaryAccount, "type" | "balance">) {
  return { creditLimit: null, exchangeRateToHome: null, ...overrides } satisfies SummaryAccount;
}

describe("summarizeAccounts", () => {
  it("converts every account to home cents and nets liabilities against assets", () => {
    const summary = summarizeAccounts([
      account({ type: "CHECKING", balance: 1_000_00 }),
      account({ type: "SAVINGS", balance: 500_00, exchangeRateToHome: 1.4 }),
      account({ type: "PROPERTY", balance: 200_000_00 }),
      account({ type: "CREDIT", balance: -300_00, creditLimit: 1_000_00 }),
      account({ type: "LOAN", balance: -10_000_00, exchangeRateToHome: 1.4 }),
    ]);

    expect(summary.assetsCents).toBe(1_000_00 + 700_00 + 200_000_00);
    expect(summary.liabilitiesCents).toBe(300_00 + 14_000_00);
    expect(summary.netWorthCents).toBe(summary.assetsCents - summary.liabilitiesCents);
  });

  it("lets an overdrawn checking account reduce assets", () => {
    const summary = summarizeAccounts([
      account({ type: "CHECKING", balance: -50_00 }),
      account({ type: "CASH", balance: 200_00 }),
    ]);

    expect(summary.assetsCents).toBe(150_00);
    expect(summary.liabilitiesCents).toBe(0);
    expect(summary.netWorthCents).toBe(150_00);
  });

  it("summarizes credit usage over cards with a limit", () => {
    const summary = summarizeAccounts([
      account({ type: "CREDIT", balance: -300_00, creditLimit: 1_000_00 }),
      account({ type: "CREDIT", balance: -500_00, creditLimit: 1_000_00, exchangeRateToHome: 1.4 }),
      account({ type: "LOAN", balance: -5_000_00 }),
    ]);

    expect(summary.creditUsage).toEqual({
      cardCount: 2,
      limitCents: 1_000_00 + 1_400_00,
      owedCents: 300_00 + 700_00,
      availableCents: 1_400_00,
      percentUsed: (1_000_00 / 2_400_00) * 100,
    });
  });

  it("counts a card with a credit balance as owing nothing, but nets it in liabilities", () => {
    const summary = summarizeAccounts([
      account({ type: "CREDIT", balance: 40_00, creditLimit: 1_000_00 }),
      account({ type: "CREDIT", balance: -200_00, creditLimit: 1_000_00 }),
    ]);

    expect(summary.creditUsage).toMatchObject({ owedCents: 200_00, availableCents: 1_800_00 });
    expect(summary.liabilitiesCents).toBe(160_00);
  });

  it("leaves a card without a limit out of usage but keeps it in liabilities", () => {
    const summary = summarizeAccounts([
      account({ type: "CREDIT", balance: -250_00 }),
      account({ type: "CREDIT", balance: -100_00, creditLimit: 500_00 }),
    ]);

    expect(summary.creditUsage).toEqual({
      cardCount: 1,
      limitCents: 500_00,
      owedCents: 100_00,
      availableCents: 400_00,
      percentUsed: 20,
    });
    expect(summary.liabilitiesCents).toBe(350_00);
  });

  it("has no credit usage without a card that has a limit", () => {
    expect(summarizeAccounts([account({ type: "CHECKING", balance: 10_00 })]).creditUsage).toBeNull();
    expect(
      summarizeAccounts([
        account({ type: "CREDIT", balance: -10_00 }),
        account({ type: "LOAN", balance: -10_00 }),
      ]).creditUsage
    ).toBeNull();
  });

  it("is all zeros with no accounts", () => {
    expect(summarizeAccounts([])).toEqual({
      assetsCents: 0,
      liabilitiesCents: 0,
      netWorthCents: 0,
      creditUsage: null,
    });
  });
});

describe("sumBalancesHomeCents", () => {
  it("adds signed balances in home cents", () => {
    expect(
      sumBalancesHomeCents([
        { balance: 100_00, exchangeRateToHome: null },
        { balance: -50_00, exchangeRateToHome: 2 },
      ])
    ).toBe(0);
  });
});
