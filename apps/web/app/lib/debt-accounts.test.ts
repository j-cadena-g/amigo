import { describe, expect, it } from "vitest";
import { debtAccountBody, debtFromAccount } from "./debt-accounts";

const createdAt = new Date("2026-01-15T00:00:00Z");
const base = {
  id: "acct-1",
  name: "Visa",
  currency: "CAD" as const,
  exchangeRateToHome: null,
  userId: "user-1" as string | null,
  createdAt,
};

describe("debtFromAccount", () => {
  it("shows a credit card as limit and available credit", () => {
    expect(
      debtFromAccount({
        ...base,
        type: "CREDIT",
        balance: -1_200_00,
        creditLimit: 5_000_00,
        originalAmount: null,
      })
    ).toEqual({
      id: "acct-1",
      name: "Visa",
      type: "CREDIT_CARD",
      balanceInitial: 5_000_00,
      balanceCurrent: 3_800_00,
      currency: "CAD",
      exchangeRateToHome: null,
      userId: "user-1",
      isShared: false,
      createdAt,
    });
  });

  it("shows a loan as amount borrowed and total paid", () => {
    expect(
      debtFromAccount({
        ...base,
        userId: null,
        currency: "USD",
        exchangeRateToHome: 1.35,
        type: "LOAN",
        balance: -8_000_00,
        creditLimit: null,
        originalAmount: 12_000_00,
      })
    ).toMatchObject({
      type: "LOAN",
      balanceInitial: 12_000_00,
      balanceCurrent: 4_000_00,
      currency: "USD",
      exchangeRateToHome: 1.35,
      userId: null,
      isShared: true,
    });
  });

  it("treats a missing limit or loan amount as the amount owed", () => {
    expect(
      debtFromAccount({ ...base, type: "CREDIT", balance: -300_00, creditLimit: null, originalAmount: null })
    ).toMatchObject({ balanceInitial: 300_00, balanceCurrent: 0 });
    expect(
      debtFromAccount({ ...base, type: "LOAN", balance: -900_00, creditLimit: null, originalAmount: null })
    ).toMatchObject({ balanceInitial: 900_00, balanceCurrent: 0 });
  });

  it("does not report a negative limit when nothing is owed", () => {
    expect(
      debtFromAccount({ ...base, type: "CREDIT", balance: 50_00, creditLimit: null, originalAmount: null })
    ).toMatchObject({ balanceInitial: 0, balanceCurrent: 50_00 });
  });
});

describe("debtAccountBody", () => {
  it("stores what a card owes as a negative balance with its limit", () => {
    expect(
      debtAccountBody({
        kind: "CREDIT_CARD",
        name: "Visa",
        currency: "CAD",
        isShared: false,
        initial: 5000,
        current: 3800,
      })
    ).toEqual({
      type: "CREDIT",
      name: "Visa",
      balance: -1200,
      creditLimit: 5000,
      currency: "CAD",
      isShared: false,
    });
  });

  it("stores what a loan still owes as a negative balance with its original amount", () => {
    expect(
      debtAccountBody({
        kind: "LOAN",
        name: "Car",
        currency: "USD",
        isShared: true,
        initial: 12000,
        current: 4000,
      })
    ).toEqual({
      type: "LOAN",
      name: "Car",
      balance: -8000,
      originalAmount: 12000,
      currency: "USD",
      isShared: true,
    });
  });

  it("avoids float noise and negative zero", () => {
    const body = debtAccountBody({
      kind: "CREDIT_CARD",
      name: "Visa",
      currency: "CAD",
      isShared: false,
      initial: 5000.1,
      current: 3800.2,
    });
    expect(body.balance).toBe(-1199.9);
    expect(
      debtAccountBody({
        kind: "LOAN",
        name: "Paid off",
        currency: "CAD",
        isShared: false,
        initial: 100,
        current: 100,
      }).balance
    ).toBe(0);
  });
});
