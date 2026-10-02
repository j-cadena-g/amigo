import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { financialCategories } from "./financial-categories";
import { households } from "./households";

export const MERCHANT_ALIAS_SOURCES = ["user", "ai"] as const;
export type MerchantAliasSource = (typeof MERCHANT_ALIAS_SOURCES)[number];

export const merchantAliases = sqliteTable(
  "merchant_aliases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    merchantKey: text("merchant_key").notNull(),
    displayName: text("display_name"),
    // Single-column FK. ON DELETE SET NULL on a composite household key would clear household_id too.
    categoryId: text("category_id").references(() => financialCategories.id, {
      onDelete: "set null",
    }),
    source: text("source", { enum: MERCHANT_ALIAS_SOURCES }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("merchant_aliases_household_merchant_key_unique").on(
      table.householdId,
      table.merchantKey
    ),
  ]
);

export type MerchantAlias = typeof merchantAliases.$inferSelect;
export type NewMerchantAlias = typeof merchantAliases.$inferInsert;
