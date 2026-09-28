import { capitalizeFirst } from "@/app/lib/format-dates";
import type { CurrencyCode } from "@amigo/db";

export interface MonthGroupTransaction {
  amount: number;
  currency: string;
  type: "income" | "expense";
  date: string;
  /** What the card actually charged, in cents of `chargedCurrency`. */
  chargedAmount?: number | null;
  chargedCurrency?: string | null;
}

export interface MonthTotals {
  /** Home-currency expenses, in cents. */
  outCents: number;
  /** Home-currency income, in cents. */
  inCents: number;
  /**
   * The month has rows with no exact home-currency figure (another currency
   * and no charge recorded in home currency); they are left out of the totals.
   */
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

export function formatMonthHeading(month: string, locale: string): string {
  return capitalizeFirst(
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    locale
  );
}

/**
 * A row's exact home-currency cents: the recorded charge when it was in home
 * currency, else the amount of a home-currency row with no charge in another
 * currency. Null when only an FX estimate would do.
 */
export function exactHomeCents(
  t: MonthGroupTransaction,
  homeCurrency: CurrencyCode
): number | null {
  if (t.chargedAmount != null) {
    return t.chargedCurrency === homeCurrency ? t.chargedAmount : null;
  }
  return t.currency === homeCurrency ? t.amount : null;
}

export function monthTotals(
  transactions: readonly MonthGroupTransaction[],
  homeCurrency: CurrencyCode
): MonthTotals {
  let outCents = 0;
  let inCents = 0;
  let hasOtherCurrencies = false;

  for (const t of transactions) {
    const cents = exactHomeCents(t, homeCurrency);
    if (cents === null) {
      hasOtherCurrencies = true;
      continue;
    }
    if (t.type === "income") inCents += cents;
    else outCents += cents;
  }

  return { outCents, inCents, hasOtherCurrencies };
}

/**
 * Group a newest-first transaction list by calendar month. With more pages to
 * load, the oldest month shown may be partial, so it gets no totals.
 */
export function groupTransactionsByMonth<T extends MonthGroupTransaction>(
  transactions: readonly T[],
  {
    homeCurrency,
    hasMore,
    locale,
  }: { homeCurrency: CurrencyCode; hasMore: boolean; locale: string }
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
      label: formatMonthHeading(month, locale),
      transactions: rows,
      totals: complete ? monthTotals(rows, homeCurrency) : null,
    };
  });
}
