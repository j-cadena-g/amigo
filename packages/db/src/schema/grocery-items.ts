import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./users";

export const groceryItems = pgTable("grocery_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Denormalized user info for display when user is deleted
  createdByUserDisplayName: text("created_by_user_display_name"),
  // Track original creator when data is transferred during "fresh start" restore
  transferredFromCreatedByUserId: uuid(
    "transferred_from_created_by_user_id"
  ).references(() => users.id, { onDelete: "set null" }),
  itemName: text("item_name").notNull(),
  category: text("category"),
  isPurchased: boolean("is_purchased").notNull().default(false),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type GroceryItem = typeof groceryItems.$inferSelect;
export type NewGroceryItem = typeof groceryItems.$inferInsert;

// Note: groceryItemsRelations is defined in grocery-tags.ts to avoid circular imports
