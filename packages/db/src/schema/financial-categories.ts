import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { budgets } from "./budgets";

export const FINANCIAL_CATEGORY_TYPES = ["income", "expense"] as const;

export const financialCategories = sqliteTable(
  "financial_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => financialCategories.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: text("type", { enum: FINANCIAL_CATEGORY_TYPES }).notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
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
    index("financial_categories_household_id_idx").on(table.householdId),
    index("financial_categories_household_parent_idx").on(
      table.householdId,
      table.parentId
    ),
  ]
);

export const budgetCategoryMappings = sqliteTable(
  "budget_category_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => financialCategories.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("budget_category_mappings_category_id_unique").on(table.categoryId),
    index("budget_category_mappings_household_id_idx").on(table.householdId),
  ]
);

export type FinancialCategory = typeof financialCategories.$inferSelect;
export type NewFinancialCategory = typeof financialCategories.$inferInsert;
export type BudgetCategoryMapping = typeof budgetCategoryMappings.$inferSelect;
