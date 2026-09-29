import { parseAmount } from "@/app/lib/decimal-input";

export interface AccountAmountInput {
  /** Balance; available credit for a credit card; amount owed for a loan. */
  amount: string;
  creditLimit: string;
  originalAmount: string;
}

/** Money fields of POST/PATCH /api/accounts, in dollars. */
export type AccountAmountFields = {
  balance: number;
  creditLimit?: number | null;
  originalAmount?: number | null;
};

const negate = (amount: number) => (amount === 0 ? 0 : -amount);

/** An optional positive amount: empty is null, so an edit can clear it. */
function parseOptionalAmount(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = parseAmount(trimmed);
  return parsed !== null && parsed > 0 ? parsed : undefined;
}

/**
 * The money fields to send for a type. A card is entered as its limit and
 * available credit (balance = available - limit); a loan as the amount owed,
 * stored as its negative. Only the limit or original amount that applies to
 * the type is sent.
 */
export function parseAccountAmounts(
  type: string,
  input: AccountAmountInput
): AccountAmountFields | { error: "amount" | "available" | "limit" } {
  const trimmed = input.amount.trim();

  if (type === "CREDIT") {
    // Cards are entered as the bank shows them: limit and available credit.
    // Available above the limit is a credit balance; below zero, over the limit.
    const creditLimit = parseOptionalAmount(input.creditLimit);
    if (creditLimit === undefined || creditLimit === null) return { error: "limit" };
    const available = trimmed === "" ? null : parseAmount(trimmed);
    if (available === null) return { error: "available" };
    const balance = Math.round((available - creditLimit) * 100) / 100;
    return { balance: balance === 0 ? 0 : balance, creditLimit };
  }

  const amount = trimmed === "" ? 0 : parseAmount(trimmed);
  if (amount === null) return { error: "amount" };
  if (type === "LOAN") {
    const originalAmount = parseOptionalAmount(input.originalAmount);
    if (originalAmount === undefined) return { error: "limit" };
    return { balance: negate(amount), originalAmount };
  }
  return { balance: amount };
}
