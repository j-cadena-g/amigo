import { eq, getDb, households } from "@amigo/db";
import { isValidTimeZone } from "./dates";

export async function getHouseholdTimezone(
  db: ReturnType<typeof getDb>,
  householdId: string
): Promise<string> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
    columns: { timezone: true },
  });
  const tz = household?.timezone ?? "UTC";
  return isValidTimeZone(tz) ? tz : "UTC";
}
