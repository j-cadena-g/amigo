import { eq, getDb, households, parseHomeCurrency } from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";

export async function getHomeCurrency(
  db: ReturnType<typeof getDb>,
  householdId: string
): Promise<CurrencyCode> {
  const household = await db.query.households.findFirst({
    where: eq(households.id, householdId),
  });
  return parseHomeCurrency(household?.homeCurrency);
}
