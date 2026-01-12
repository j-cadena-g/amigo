import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./users";
import { transactionTypeEnum } from "./transactions";
import { budgets } from "./budgets";
import { currencyEnum } from "./currencies";

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

export const recurringTransactions = pgTable("recurring_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Denormalized user info for display when user is deleted
  userDisplayName: text("user_display_name"),
  // Track original creator when data is transferred during "fresh start" restore
  transferredFromUserId: uuid("transferred_from_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  budgetId: uuid("budget_id").references(() => budgets.id, {
    onDelete: "set null",
  }),

  // Transaction Template Fields
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum("currency").notNull().default("CAD"),
  category: text("category").notNull(),
  description: text("description"),
  type: transactionTypeEnum("type").notNull(),

  // Scheduling Fields
  frequency: recurringFrequencyEnum("frequency").notNull(),
  interval: integer("interval").notNull().default(1),
  dayOfMonth: integer("day_of_month"), // 1-31, used for MONTHLY frequency to specify which day
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }),
  lastRunDate: date("last_run_date", { mode: "date" }),
  nextRunDate: date("next_run_date", { mode: "date" }).notNull(),
  active: boolean("active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
