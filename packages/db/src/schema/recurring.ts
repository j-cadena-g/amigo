import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";
import { TRANSACTION_TYPES } from "./transactions";
import { budgets } from "./budgets";
import { CURRENCY_CODES } from "./currencies";

export const RECURRING_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
] as const;

export const recurringTransactions = sqliteTable("recurring_transactions", {
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

  // Transaction Template Fields
  amount: integer("amount").notNull(), // Stored as integer cents
  currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
  category: text("category").notNull(),
  description: text("description"),
  type: text("type", { enum: TRANSACTION_TYPES }).notNull(),

  // Scheduling Fields
  frequency: text("frequency", { enum: RECURRING_FREQUENCIES }).notNull(),
  interval: integer("interval").notNull().default(1),
  dayOfMonth: integer("day_of_month"), // 1-31, used for MONTHLY frequency
  startDate: text("start_date").notNull(), // ISO 8601 YYYY-MM-DD
  endDate: text("end_date"), // ISO 8601 YYYY-MM-DD
  lastRunDate: text("last_run_date"), // ISO 8601 YYYY-MM-DD
  nextRunDate: text("next_run_date").notNull(), // ISO 8601 YYYY-MM-DD
  active: integer("active", { mode: "boolean" }).notNull().default(true),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
