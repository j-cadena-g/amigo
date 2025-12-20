import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { transactions } from "@amigo/db/schema";

export const insertTransactionSchema = createInsertSchema(transactions);
export const selectTransactionSchema = createSelectSchema(transactions);

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type SelectTransaction = z.infer<typeof selectTransactionSchema>;
