import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { households } from "@amigo/db/schema";

export const insertHouseholdSchema = createInsertSchema(households);
export const selectHouseholdSchema = createSelectSchema(households);

export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type SelectHousehold = z.infer<typeof selectHouseholdSchema>;
