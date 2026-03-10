import type { Env } from "../env";

export interface HouseholdUpdatePayload {
  type: string;
  action: string;
  entityId?: string;
  count?: number;
}

export async function broadcastToHousehold(
  env: Env,
  householdId: string,
  payload: HouseholdUpdatePayload,
  senderId?: string
) {
  const id = env.HOUSEHOLD.idFromName(householdId);
  const stub = env.HOUSEHOLD.get(id);
  const url = senderId
    ? `https://do/broadcast?senderId=${encodeURIComponent(senderId)}`
    : "https://do/broadcast";
  await stub.fetch(
    new Request(url, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
}

export async function invalidateUserSession(
  env: Env,
  householdId: string,
  userId: string
) {
  const id = env.HOUSEHOLD.idFromName(householdId);
  const stub = env.HOUSEHOLD.get(id);
  await stub.fetch(
    new Request(`https://do/invalidate?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
    })
  );
}
