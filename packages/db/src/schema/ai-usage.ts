import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Account-wide AI neuron totals. Not household data, so these queries are not household-scoped. */
export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    day: text("day").notNull(),
    feature: text("feature").notNull(),
    neurons: real("neurons").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.day, table.feature] })]
);

export type AiUsageDaily = typeof aiUsageDaily.$inferSelect;
export type NewAiUsageDaily = typeof aiUsageDaily.$inferInsert;
