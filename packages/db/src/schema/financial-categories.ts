import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
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
    parentId: text("parent_id"),
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
    uniqueIndex("financial_categories_household_id_id_unique").on(
      table.householdId,
      table.id
    ),
    uniqueIndex("financial_categories_sibling_name_unique")
      .on(
        table.householdId,
        sql`coalesce(${table.parentId}, '')`,
        table.type,
        sql`lower(${table.name})`
      )
      .where(sql`${table.deletedAt} IS NULL`),
    foreignKey({
      columns: [table.householdId, table.parentId],
      foreignColumns: [table.householdId, table.id],
      name: "financial_categories_parent_household_fk",
    }),
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
    budgetId: text("budget_id").notNull(),
    categoryId: text("category_id").notNull(),
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
    foreignKey({
      columns: [table.householdId, table.budgetId],
      foreignColumns: [budgets.householdId, budgets.id],
      name: "budget_category_mappings_budget_household_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.categoryId],
      foreignColumns: [financialCategories.householdId, financialCategories.id],
      name: "budget_category_mappings_category_household_fk",
    }),
  ]
);

export type FinancialCategory = typeof financialCategories.$inferSelect;
export type NewFinancialCategory = typeof financialCategories.$inferInsert;
export type BudgetCategoryMapping = typeof budgetCategoryMappings.$inferSelect;
