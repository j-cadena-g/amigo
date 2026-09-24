import { getDb, households, scopeToHousehold } from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";

/**
 * Returns the authenticated user's identity, household role, and household
 * settings as JSON. Mirrors the session that page loaders resolve server-side,
 * so non-browser clients have a single endpoint to bootstrap from.
 */
export const handleMeRequest: ApiHandler = async ({ env, request, session }) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  await enforceRateLimit(
    env,
    `${session!.userId}:me:get`,
    ROUTE_RATE_LIMITS.me.get
  );

  const db = getDb(env.DB);
  const household = await db.query.households.findFirst({
    where: scopeToHousehold(households.id, session!.householdId),
  });

  return Response.json({
    user: {
      id: session!.userId,
      email: session!.email,
      name: session!.name,
      role: session!.role,
    },
    household: household
      ? {
          id: household.id,
          name: household.name,
          homeCurrency: household.homeCurrency,
          timezone: household.timezone,
        }
      : null,
  });
};
