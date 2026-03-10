import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { households } from "./households";
import { groceryItems } from "./grocery-items";
import { users } from "./users";

export const groceryTags = sqliteTable("grocery_tags", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("blue"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const groceryItemTags = sqliteTable(
  "grocery_item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => groceryItems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
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

// Relations for grocery_items (one-to-many with grocery_item_tags, many-to-one with users)
// Defined here to avoid circular imports between grocery-items.ts and grocery-tags.ts
export const groceryItemsRelations = relations(
  groceryItems,
  ({ many, one }) => ({
    groceryItemTags: many(groceryItemTags),
    createdByUser: one(users, {
      fields: [groceryItems.createdByUserId],
      references: [users.id],
    }),
  })
);

export type GroceryTag = typeof groceryTags.$inferSelect;
export type NewGroceryTag = typeof groceryTags.$inferInsert;
export type GroceryItemTag = typeof groceryItemTags.$inferSelect;
export type NewGroceryItemTag = typeof groceryItemTags.$inferInsert;
