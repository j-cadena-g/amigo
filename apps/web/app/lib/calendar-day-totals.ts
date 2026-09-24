import { CURRENCY_CODES, type CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";

export interface TransactionTotalEvent {
  type: string;
  metadata?: {
    amount?: number;
    currency?: string;
    transactionType?: "income" | "expense";
  };
}

export interface DayTransactionTotal {
  currency: CurrencyCode;
  netCents: number;
}

const CURRENCY_CODE_SET = new Set<string>(CURRENCY_CODES);

function asCurrency(value: string | undefined): CurrencyCode | null {
  if (value == null || value === "") return "CAD";
  if (CURRENCY_CODE_SET.has(value)) return value as CurrencyCode;
  return null;
}

/**
 * Net of the money shown on a day. Income adds; expenses subtract.
 * Includes posted transactions and scheduled recurring amounts. Grocery
 * markers have no amount, so they do not change the total.
 */
export function transactionTotalsForDay(
  events: TransactionTotalEvent[]
): DayTransactionTotal[] {
  const nets = new Map<CurrencyCode, number>();

  for (const event of events) {
    const amount = event.metadata?.amount;
    const transactionType = event.metadata?.transactionType;
    if (amount == null) continue;
    if (transactionType !== "income" && transactionType !== "expense") continue;
    const currency = asCurrency(event.metadata?.currency);
    if (currency == null) continue;
    const signed = transactionType === "income" ? amount : -amount;
    nets.set(currency, (nets.get(currency) ?? 0) + signed);
  }

  return [...nets.entries()]
    .map(([currency, netCents]) => ({ currency, netCents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatDayTotal(
  netCents: number,
  currency: CurrencyCode,
  options?: { compact?: boolean }
): string {
  const prefix = netCents > 0 ? "+" : "";
  return `${prefix}${formatCents(netCents, currency, options)}`;
}
