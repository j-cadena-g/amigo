import {
  and,
  eq,
  FORMAT_LOCALES,
  getDb,
  households,
  scopeToHousehold,
  users,
} from "@amigo/db";
import { z } from "zod";
import { assertSessionStillValid } from "../lib/session";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { AppSession } from "../env";
import type { ApiHandler } from "./route";

const patchMeSchema = z.object({
  /** A supported format, or null to follow the household and browser. */
  locale: z.enum(FORMAT_LOCALES).nullable(),
});

async function meBody(db: ReturnType<typeof getDb>, session: AppSession) {
  const [user, household] = await Promise.all([
    db.query.users.findFirst({
      columns: { locale: true },
      where: and(
        eq(users.id, session.userId),
        scopeToHousehold(users.householdId, session.householdId)
      ),
    }),
    db.query.households.findFirst({
      where: scopeToHousehold(households.id, session.householdId),
    }),
  ]);

  return {
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      locale: user?.locale ?? null,
    },
    household: household
      ? {
          id: household.id,
          name: household.name,
          homeCurrency: household.homeCurrency,
          timezone: household.timezone,
        }
      : null,
  };
}

/**
 * Returns the authenticated user's identity, household role, and household
 * settings as JSON. Mirrors the session that page loaders resolve server-side,
 * so non-browser clients have a single endpoint to bootstrap from. PATCH sets
 * the user's own preferences (their number and date format).
 */
export const handleMeRequest: ApiHandler = async ({ env, request, session }) => {
  const db = getDb(env.DB);

  if (request.method === "GET") {
    await enforceRateLimit(
      env,
      `${session!.userId}:me:get`,
      ROUTE_RATE_LIMITS.me.get
    );
    return Response.json(await meBody(db, session!));
  }

  if (request.method === "PATCH") {
    await enforceRateLimit(
      env,
      `${session!.userId}:me:patch`,
      ROUTE_RATE_LIMITS.me.patch
    );
    await assertSessionStillValid(db, session!);

    const { locale } = patchMeSchema.parse(await request.json());
    await db
      .update(users)
      .set({ locale })
      .where(
        and(
          eq(users.id, session!.userId),
          scopeToHousehold(users.householdId, session!.householdId)
        )
      );
    return Response.json(await meBody(db, session!));
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, PATCH" },
  });
};
