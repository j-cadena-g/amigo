import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";
import { users } from "./users";
import { budgets } from "./budgets";
import { financialAccounts } from "./financial-accounts";
import { financialCategories } from "./financial-categories";
import { CURRENCY_CODES } from "./currencies";

export const TRANSACTION_TYPES = ["income", "expense"] as const;

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Denormalized user info for display when user is deleted
    userDisplayName: text("user_display_name"),
    // Track original creator when data is transferred during "fresh start" restore
    transferredFromUserId: text("transferred_from_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    budgetId: text("budget_id").references(() => budgets.id, {
      onDelete: "set null",
    }),
    accountId: text("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    /** Posted / cleared timestamp (ms); null = pending */
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    externalId: text("external_id"),
    importBatchId: text("import_batch_id"),
    reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
    amount: integer("amount").notNull(), // Stored as integer cents (1234 = $12.34)
    currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
    // Exchange rate to home currency at time of creation (null if same as home currency)
    exchangeRateToHome: real("exchange_rate_to_home"),
    /**
     * What the card or bank actually charged for this row, fees and its own
     * rate included, in integer cents of `chargedCurrency` (the household
     * home currency when entered). Null means use `amount * exchangeRateToHome`.
     */
    chargedAmount: integer("charged_amount"),
    chargedCurrency: text("charged_currency", { enum: CURRENCY_CODES }),
    // Exchange rate from chargedCurrency to home (null if same as home currency)
    chargedExchangeRateToHome: real("charged_exchange_rate_to_home"),
    categoryId: text("category_id").references(() => financialCategories.id, {
      onDelete: "set null",
    }),
    /** Denormalized display name; kept in sync when categoryId is set. */
    category: text("category").notNull(),
    description: text("description"),
    /** The bank's original text for an imported row. Null on manual entries. */
    bankDescription: text("bank_description"),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    date: text("date").notNull(), // ISO 8601 YYYY-MM-DD
    /** Explicit reminder instants, sorted canonical UTC ISO strings. */
    reminderTimes: text("reminder_times", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    /** The member who explicitly scheduled these reminders. */
    reminderUserId: text("reminder_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("transactions_household_id_idx").on(table.householdId),
    index("transactions_reminder_user_id_idx")
      .on(table.reminderUserId)
      .where(sql`${table.reminderUserId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ]
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
