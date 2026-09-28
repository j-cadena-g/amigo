import type { UiLanguage } from "@amigo/db";
import { messagesFor } from "@/app/i18n";

/** Response of GET /api/members/:id/data-summary. */
export interface MemberDataSummary {
  transactions: number;
  recurringTransactions: number;
  personalBudgets: number;
  accounts: number;
  groceryItems: number;
}

const ORDER: (keyof MemberDataSummary)[] = [
  "transactions",
  "recurringTransactions",
  "personalBudgets",
  "accounts",
  "groceryItems",
];

/**
 * Non-zero counts as one phrase, e.g. "12 transactions, 1 budget, and 4 grocery
 * items" or "12 movimientos, 1 presupuesto y 4 artículos de compras". Empty
 * when the member hasn't added anything.
 */
export function describeMemberData(summary: MemberDataSummary, language: UiLanguage): string {
  const labels = messagesFor(language).household.members.data;
  const parts = ORDER.flatMap((key) => {
    const count = summary[key] ?? 0;
    return count > 0 ? [labels[key](count)] : [];
  });
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(parts);
}
