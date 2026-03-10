import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";
import { budgets } from "./budgets";
import { CURRENCY_CODES } from "./currencies";

export const TRANSACTION_TYPES = ["income", "expense"] as const;

export const transactions = sqliteTable("transactions", {
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
  amount: integer("amount").notNull(), // Stored as integer cents (1234 = $12.34)
  currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
  // Exchange rate to home currency at time of creation (null if same as home currency)
  exchangeRateToHome: real("exchange_rate_to_home"),
  category: text("category").notNull(),
  description: text("description"),
  type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
  date: text("date").notNull(), // ISO 8601 YYYY-MM-DD
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
