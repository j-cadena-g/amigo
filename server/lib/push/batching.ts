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
