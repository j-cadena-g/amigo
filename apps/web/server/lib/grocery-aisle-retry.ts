import {
  and,
  eq,
  getDb,
  groceryItems,
  isNull,
  scopeToHousehold,
  type CurrencyCode,
} from "@amigo/db";
import { DEFAULT_GROCERY_CATEGORY } from "@/app/lib/grocery-categories";
import type { Env } from "../env";
import { insertManyAuditLogs } from "./audit";
import {
  GROCERY_CATEGORY_RETRY_TIMEOUT_MS,
  categorizeGroceryItem,
  groceryCategoryAi,
} from "./grocery-category";
import { broadcastToHousehold } from "./realtime";

/**
 * Asks Jev once more about an item that was filed under General because Jev
 * didn't decide when it was added (slow or unsure). Runs after the response,
 * so it can wait longer. Moves the item only if it still has the same name, is
 * still in General, and no one pinned or deleted it in the meantime, then
 * tells every device, the adder's included. The move is audited as the
 * adder's, like a rename. Returns whether the item moved.
 */
export async function retryGroceryAisle(
  env: Env,
  {
    householdId,
    userId,
    itemId,
    itemName,
    homeCurrency,
  }: {
    householdId: string;
    userId: string;
    itemId: string;
    itemName: string;
    homeCurrency: () => Promise<CurrencyCode | null>;
  }
): Promise<boolean> {
  const ai = groceryCategoryAi(env.AI);
  if (!ai) return false;

  const decision = await categorizeGroceryItem(ai, itemName, {
    homeCurrency,
    timeoutMs: GROCERY_CATEGORY_RETRY_TIMEOUT_MS,
  });
  if (!decision.decided || !decision.category || decision.category === DEFAULT_GROCERY_CATEGORY) {
    return false;
  }

  const db = getDb(env.DB);
  const unchanged = and(
    eq(groceryItems.id, itemId),
    scopeToHousehold(groceryItems.householdId, householdId),
    isNull(groceryItems.deletedAt),
    eq(groceryItems.itemName, itemName),
    eq(groceryItems.categorySource, "ai"),
    eq(groceryItems.category, DEFAULT_GROCERY_CATEGORY)
  );
  const before = await db.query.groceryItems.findFirst({ where: unchanged });
  if (!before) return false;
  const moved = await db
    .update(groceryItems)
    .set({ category: decision.category, updatedAt: new Date() })
    .where(unchanged)
    .returning()
    .get();
  if (!moved) return false;

  await insertManyAuditLogs(db, [
    {
      householdId,
      tableName: "grocery_items",
      recordId: itemId,
      operation: "UPDATE",
      oldValues: before,
      newValues: moved,
      changedBy: userId,
    },
  ]);

  // No sender: the adder's own device has to refresh to see the move.
  await broadcastToHousehold(env, householdId, {
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: itemId,
  });
  return true;
}
