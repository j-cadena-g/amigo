import type { Env } from "../env";

export interface HouseholdUpdatePayload {
  type: string;
  action: string;
  entityId?: string;
  count?: number;
}

export function buildHouseholdBroadcastUrl(senderId?: string): string {
  return senderId
    ? `https://do/broadcast?senderId=${encodeURIComponent(senderId)}`
    : "https://do/broadcast";
}

export async function broadcastToHousehold(
  env: Env,
  householdId: string,
  payload: HouseholdUpdatePayload,
  senderId?: string
) {
  try {
    const id = env.HOUSEHOLD.idFromName(householdId);
    const stub = env.HOUSEHOLD.get(id);
    const url = buildHouseholdBroadcastUrl(senderId);
    const res = await stub.fetch(
      new Request(url, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    if (!res.ok) {
      throw new Error(`Durable Object /broadcast failed: ${res.status}`);
    }
  } catch (err) {
    // Durable Object may not be available in local dev — don't fail the request
    console.warn("broadcastToHousehold failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

export async function invalidateUserSession(
  env: Env,
  householdId: string,
  userId: string
) {
  try {
    const id = env.HOUSEHOLD.idFromName(householdId);
    const stub = env.HOUSEHOLD.get(id);
    const res = await stub.fetch(
      new Request(`https://do/invalidate?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
      })
    );
    if (!res.ok) {
      throw new Error(`Durable Object /invalidate failed: ${res.status}`);
    }
  } catch (err) {
    console.warn("invalidateUserSession failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}
