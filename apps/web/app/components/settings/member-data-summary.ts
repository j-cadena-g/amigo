/** Response of GET /api/members/:id/data-summary. */
export interface MemberDataSummary {
  transactions: number;
  recurringTransactions: number;
  personalBudgets: number;
  assets: number;
  debts: number;
  groceryItems: number;
}

const LABELS: Record<keyof MemberDataSummary, [singular: string, plural: string]> = {
  transactions: ["transaction", "transactions"],
  recurringTransactions: ["recurring rule", "recurring rules"],
  personalBudgets: ["budget", "budgets"],
  assets: ["asset", "assets"],
  debts: ["debt", "debts"],
  groceryItems: ["grocery item", "grocery items"],
};

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * Non-zero counts as one phrase, e.g. "12 transactions, 1 budget, and 4 grocery
 * items". Empty when the member hasn't added anything.
 */
export function describeMemberData(summary: MemberDataSummary): string {
  const parts = (Object.keys(LABELS) as (keyof MemberDataSummary)[]).flatMap((key) => {
    const count = summary[key] ?? 0;
    if (count <= 0) return [];
    const [singular, plural] = LABELS[key];
    return [`${count} ${count === 1 ? singular : plural}`];
  });
  return listFormat.format(parts);
}
