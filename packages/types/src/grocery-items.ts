import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { groceryItems } from "@amigo/db/schema";

export const insertGroceryItemSchema = createInsertSchema(groceryItems);
export const selectGroceryItemSchema = createSelectSchema(groceryItems);

export type InsertGroceryItem = z.infer<typeof insertGroceryItemSchema>;
export type SelectGroceryItem = z.infer<typeof selectGroceryItemSchema>;
