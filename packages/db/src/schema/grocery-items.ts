import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { users } from "./users";

export const groceryItems = sqliteTable("grocery_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Denormalized user info for display when user is deleted
  createdByUserDisplayName: text("created_by_user_display_name"),
  // Track original creator when data is transferred during "fresh start" restore
  transferredFromCreatedByUserId: text(
    "transferred_from_created_by_user_id"
  ).references(() => users.id, { onDelete: "set null" }),
  itemName: text("item_name").notNull(),
  category: text("category"),
  isPurchased: integer("is_purchased", { mode: "boolean" })
    .notNull()
    .default(false),
  purchasedAt: integer("purchased_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type GroceryItem = typeof groceryItems.$inferSelect;
export type NewGroceryItem = typeof groceryItems.$inferInsert;

// Note: groceryItemsRelations is defined in grocery-tags.ts to avoid circular imports
