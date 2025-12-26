import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { groceryItems } from "./grocery-items";

export const groceryTags = pgTable("grocery_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("blue"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const groceryItemTags = pgTable(
  "grocery_item_tags",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => groceryItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => groceryTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] })]
);

// Relations for grocery_tags (one-to-many with grocery_item_tags)
export const groceryTagsRelations = relations(groceryTags, ({ many }) => ({
  groceryItemTags: many(groceryItemTags),
}));

// Relations for grocery_item_tags (many-to-one with grocery_items and grocery_tags)
export const groceryItemTagsRelations = relations(
  groceryItemTags,
  ({ one }) => ({
    groceryItem: one(groceryItems, {
      fields: [groceryItemTags.itemId],
      references: [groceryItems.id],
    }),
    groceryTag: one(groceryTags, {
      fields: [groceryItemTags.tagId],
      references: [groceryTags.id],
    }),
  })
);

// Relations for grocery_items (one-to-many with grocery_item_tags)
// Defined here to avoid circular imports between grocery-items.ts and grocery-tags.ts
export const groceryItemsRelations = relations(groceryItems, ({ many }) => ({
  groceryItemTags: many(groceryItemTags),
}));

export type GroceryTag = typeof groceryTags.$inferSelect;
export type NewGroceryTag = typeof groceryTags.$inferInsert;
export type GroceryItemTag = typeof groceryItemTags.$inferSelect;
export type NewGroceryItemTag = typeof groceryItemTags.$inferInsert;
