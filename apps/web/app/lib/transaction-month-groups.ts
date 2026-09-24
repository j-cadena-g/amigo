import type { CurrencyCode } from "@amigo/db";

export interface MonthGroupTransaction {
  amount: number;
  currency: string;
  type: "income" | "expense";
  date: string;
}

export interface MonthTotals {
  /** Home-currency expenses, in cents. */
  outCents: number;
  /** Home-currency income, in cents. */
  inCents: number;
  /** The month has rows in other currencies; they are left out of the totals. */
  hasOtherCurrencies: boolean;
}

export interface TransactionMonthGroup<T> {
  /** YYYY-MM */
  month: string;
  /** e.g. "September 2026" */
  label: string;
  transactions: T[];
  /** Null while later pages may still hold rows for this month. */
  totals: MonthTotals | null;
}

export function monthKey(date: string): string {
  return date.split("T")[0]!.slice(0, 7);
}

export function formatMonthHeading(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthTotals(
  transactions: readonly MonthGroupTransaction[],
  homeCurrency: CurrencyCode
): MonthTotals {
  let outCents = 0;
  let inCents = 0;
  let hasOtherCurrencies = false;

  for (const t of transactions) {
    if (t.currency !== homeCurrency) {
      hasOtherCurrencies = true;
      continue;
    }
    if (t.type === "income") inCents += t.amount;
    else outCents += t.amount;
  }

  return { outCents, inCents, hasOtherCurrencies };
}

/**
 * Group a newest-first transaction list by calendar month. With more pages to
 * load, the oldest month shown may be partial, so it gets no totals.
 */
export function groupTransactionsByMonth<T extends MonthGroupTransaction>(
  transactions: readonly T[],
  { homeCurrency, hasMore }: { homeCurrency: CurrencyCode; hasMore: boolean }
): TransactionMonthGroup<T>[] {
  const byMonth = new Map<string, T[]>();
  for (const t of transactions) {
    const key = monthKey(t.date);
    const rows = byMonth.get(key);
    if (rows) rows.push(t);
    else byMonth.set(key, [t]);
  }

  const months = [...byMonth.entries()];
  return months.map(([month, rows], index) => {
    const complete = !hasMore || index < months.length - 1;
    return {
      month,
      label: formatMonthHeading(month),
      transactions: rows,
      totals: complete ? monthTotals(rows, homeCurrency) : null,
    };
  });
}
