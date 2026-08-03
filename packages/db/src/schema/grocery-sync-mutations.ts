import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { groceryItems } from "./grocery-items";
import { households } from "./households";

/** Idempotency keys for offline grocery sync `add` mutations. */
export const grocerySyncMutations = sqliteTable(
  "grocery_sync_mutations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    groceryItemId: text("grocery_item_id")
      .notNull()
      .references(() => groceryItems.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("grocery_sync_mutations_household_id_idx").on(table.householdId),
    index("grocery_sync_mutations_created_at_idx").on(table.createdAt),
  ]
);

export type GrocerySyncMutation = typeof grocerySyncMutations.$inferSelect;
