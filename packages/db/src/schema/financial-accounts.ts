import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";
import { CURRENCY_CODES } from "./currencies";

export const FINANCIAL_ACCOUNT_TYPES = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "CREDIT",
  "INVESTMENT",
  "OTHER",
] as const;

/** Labels for account-type selects (display order). */
export const FINANCIAL_ACCOUNT_TYPE_OPTIONS: readonly {
  value: (typeof FINANCIAL_ACCOUNT_TYPES)[number];
  label: string;
}[] = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT", label: "Credit card" },
  { value: "INVESTMENT", label: "Investment" },
  { value: "OTHER", label: "Other" },
];

export const financialAccounts = sqliteTable(
  "financial_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: text("type", { enum: FINANCIAL_ACCOUNT_TYPES }).notNull().default("CASH"),
    /** ISO currency; default is CAD and should match the household's home currency when unset in API. */
    currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
    balance: integer("balance").notNull().default(0),
    exchangeRateToHome: real("exchange_rate_to_home"),
    /** Soft-hide from normal lists; row remains queryable for history. */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    /** Tombstone: account removed; prefer over `archived` when deleting. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("financial_accounts_household_id_idx").on(table.householdId),
    index("financial_accounts_household_deleted_idx").on(table.householdId, table.deletedAt),
  ]
);

export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type NewFinancialAccount = typeof financialAccounts.$inferInsert;
