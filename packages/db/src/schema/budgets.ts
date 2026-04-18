import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";
import { CURRENCY_CODES } from "./currencies";

export const BUDGET_PERIODS = ["weekly", "monthly", "yearly"] as const;

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // If userId is NULL, the budget is shared (household-wide)
    // If userId is set, the budget is personal (only that user's spending counts)
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Track original creator when data is transferred during "fresh start" restore
    transferredFromUserId: text("transferred_from_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    name: text("name").notNull(),
    category: text("category"),
    limitAmount: integer("limit_amount").notNull(), // Stored as integer cents
    currency: text("currency", { enum: CURRENCY_CODES }).notNull().default("CAD"),
    period: text("period", { enum: BUDGET_PERIODS }).notNull().default("monthly"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("budgets_household_id_idx").on(table.householdId)]
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
