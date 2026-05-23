import type { Env } from "../../env";
import type { GroceryPushEvent } from "./batching";

export type GroceryPushEventInput = Omit<
  GroceryPushEvent,
  "householdId" | "timestamp"
>;

/**
 * Queue a grocery push event for batched delivery via the household DO.
 * Non-fatal if the DO is unavailable (e.g. local dev without DO).
 */
export async function queueGroceryPush(
  env: Env,
  householdId: string,
  event: GroceryPushEventInput
): Promise<void> {
  try {
    const id = env.HOUSEHOLD.idFromName(householdId);
    const stub = env.HOUSEHOLD.get(id);
    const res = await stub.fetch(
      new Request(
        `https://do/queue-push?householdId=${encodeURIComponent(householdId)}`,
        {
          method: "POST",
          body: JSON.stringify(event),
        }
      )
    );
    if (!res.ok) {
      throw new Error(`Durable Object /queue-push failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(
      "queueGroceryPush failed (non-fatal):",
      err instanceof Error ? err.message : err
    );
  }
}
