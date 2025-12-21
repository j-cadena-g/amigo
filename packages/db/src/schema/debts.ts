import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households } from "./households";

export const debtTypeEnum = pgEnum("debt_type", ["LOAN", "CREDIT_CARD"]);

export const debts = pgTable("debts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: debtTypeEnum("type").notNull(),
  // For LOAN: Loan Amount | For CREDIT_CARD: Credit Limit
  balanceInitial: numeric("balance_initial", { precision: 12, scale: 2 }).notNull(),
  // For LOAN: Total Paid | For CREDIT_CARD: Available Credit
  balanceCurrent: numeric("balance_current", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
