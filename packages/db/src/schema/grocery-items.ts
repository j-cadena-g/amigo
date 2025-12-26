import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./users";

export const groceryItems = pgTable("grocery_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  category: text("category"),
  isPurchased: boolean("is_purchased").notNull().default(false),
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
