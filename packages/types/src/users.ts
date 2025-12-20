import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { users } from "@amigo/db/schema";

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = z.infer<typeof selectUserSchema>;
