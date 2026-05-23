import { z } from "zod";

export const groceryPushEventInputSchema = z.object({
  type: z.enum(["add", "purchase"]),
  itemName: z.string().min(1).max(255),
  actorUserId: z.string().min(1),
  actorName: z.string().min(1).max(255),
});

export interface GroceryPushEvent {
  type: "add" | "purchase";
  itemName: string;
  actorUserId: string;
  actorName: string;
  householdId: string;
  timestamp: number;
}

export const PUSH_BATCH_STORAGE_KEY = "push_batch";
export const PUSH_BATCH_DELAY_MS = 7000;
