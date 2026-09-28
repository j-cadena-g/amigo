import { parseAmount } from "@/app/lib/decimal-input";

export interface AccountAmountInput {
  /** Balance, or the amount owed for a credit card or loan. */
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
 * The money fields to send for a type. Cards and loans are entered as the
 * amount owed and stored as its negative; only the limit or original amount
 * that applies to the type is sent.
 */
export function parseAccountAmounts(
  type: string,
  input: AccountAmountInput
): AccountAmountFields | { error: "amount" | "limit" } {
  const trimmed = input.amount.trim();
  const amount = trimmed === "" ? 0 : parseAmount(trimmed);
  if (amount === null) return { error: "amount" };

  if (type === "CREDIT") {
    const creditLimit = parseOptionalAmount(input.creditLimit);
    if (creditLimit === undefined) return { error: "limit" };
    return { balance: negate(amount), creditLimit };
  }
  if (type === "LOAN") {
    const originalAmount = parseOptionalAmount(input.originalAmount);
    if (originalAmount === undefined) return { error: "limit" };
    return { balance: negate(amount), originalAmount };
  }
  return { balance: amount };
}
