import { createClerkClient } from "@clerk/backend";
import {
  and,
  CURRENCY_CODES,
  eq,
  getDb,
  households,
  isNull,
  scopeToHousehold,
  users,
} from "@amigo/db";
import { z } from "zod";
import { setClerkHouseholdMetadata } from "../lib/clerk-household-metadata";
import { isValidTimeZone } from "../lib/dates";
import { ActionError, logServerError } from "../lib/errors";
import { refreshHouseholdHomeCurrencyRates } from "../lib/home-currency-refresh";
import { assertPermission, canManageSharedBudgets } from "../lib/permissions";
import { assertSessionStillValid } from "../lib/session";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";

const patchSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  homeCurrency: z.enum(CURRENCY_CODES).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export const handleSettingsRequest: ApiHandler = async ({
  env,
  request,
  session,
}) => {
  const db = getDb(env.DB);

  if (request.method === "GET") {
    await enforceRateLimit(
      env,
      `${session!.userId}:settings:get`,
      ROUTE_RATE_LIMITS.settings.get
    );

    const household = await db.query.households.findFirst({
      where: eq(households.id, session!.householdId),
    });

    return Response.json(household);
  }

  if (request.method === "PATCH") {
    await enforceRateLimit(
      env,
      `${session!.userId}:settings:patch`,
      ROUTE_RATE_LIMITS.settings.patch
    );

    assertPermission(
      canManageSharedBudgets(session!),
      "Only owners and admins can update household settings"
    );
    await assertSessionStillValid(db, session!);

    const validated = patchSettingsSchema.parse(await request.json());

    if (
      validated.name === undefined &&
      validated.homeCurrency === undefined &&
      validated.timezone === undefined
    ) {
      const current = await db.query.households.findFirst({
        where: eq(households.id, session!.householdId),
      });
      return Response.json(current);
    }

    if (validated.timezone !== undefined && !isValidTimeZone(validated.timezone)) {
      throw new ActionError("Invalid timezone", "VALIDATION_ERROR");
    }

    const updateData: Partial<typeof households.$inferInsert> & {
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    if (validated.name !== undefined) {
      updateData.name = validated.name;
    }
    if (validated.homeCurrency !== undefined) {
      updateData.homeCurrency = validated.homeCurrency;
    }
    if (validated.timezone !== undefined) {
      updateData.timezone = validated.timezone;
    }

    // Refresh FX snapshots before committing home_currency so a missing rate
    // cannot leave the household row updated with stale denormalized rates.
    if (validated.homeCurrency !== undefined) {
      try {
        await refreshHouseholdHomeCurrencyRates(
          env,
          db,
          session!.householdId,
          validated.homeCurrency
        );
      } catch (error) {
        logServerError("settings-home-currency-refresh", error, {
          householdId: session!.householdId,
          homeCurrency: validated.homeCurrency,
        });
        throw new ActionError(
          error instanceof Error
            ? error.message
            : "Failed to refresh home currency rates",
          "INTERNAL_ERROR"
        );
      }
    }

    const updated = await db
      .update(households)
      .set(updateData)
      .where(eq(households.id, session!.householdId))
      .returning()
      .get();

    if (validated.name !== undefined) {
      const members = await db
        .select({ authId: users.authId })
        .from(users)
        .where(
          and(
            scopeToHousehold(users.householdId, session!.householdId),
            isNull(users.deletedAt)
          )
        )
        .all();

      const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      for (const member of members) {
        try {
          await setClerkHouseholdMetadata(clerk, member.authId, {
            householdId: session!.householdId,
            householdName: validated.name,
          });
        } catch (error) {
          logServerError("settings-clerk-household-metadata", error, {
            householdId: session!.householdId,
            authId: member.authId,
          });
        }
      }
    }

    return Response.json(updated);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, PATCH" },
  });
};
