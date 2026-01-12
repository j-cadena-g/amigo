import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./users";
import { currencyEnum } from "./currencies";

export const budgetPeriodEnum = pgEnum("budget_period", [
  "weekly",
  "monthly",
  "yearly",
]);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  // If userId is NULL, the budget is shared (household-wide)
  // If userId is set, the budget is personal (only that user's spending counts)
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Track original creator when data is transferred during "fresh start" restore
  transferredFromUserId: uuid("transferred_from_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  name: text("name").notNull(), // Budget name (required)
  category: text("category"), // Optional category for filtering
  limitAmount: numeric("limit_amount", { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum("currency").notNull().default("CAD"),
  period: budgetPeriodEnum("period").notNull().default("monthly"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
