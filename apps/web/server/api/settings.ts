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
import { getCloudflare } from "../../router-context";
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
  loadContext,
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

    const previous = await db.query.households.findFirst({
      where: eq(households.id, session!.householdId),
    });
    if (!previous) {
      throw new ActionError("Household not found", "NOT_FOUND");
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

    let updated: typeof previous;

    const homeCurrencyChanged =
      validated.homeCurrency !== undefined &&
      validated.homeCurrency !== previous.homeCurrency;

    // Refresh FX snapshots and commit home_currency in one atomic batch so a
    // missing rate cannot leave converted values disagreeing with the household row.
    // Skip the provider when homeCurrency is unchanged (name/timezone-only updates).
    if (homeCurrencyChanged) {
      try {
        await refreshHouseholdHomeCurrencyRates(
          env,
          db,
          session!.householdId,
          validated.homeCurrency!,
          {
            buildAdditionalStatements: (refreshDb) => [
              refreshDb
                .update(households)
                .set(updateData)
                .where(eq(households.id, session!.householdId)),
            ],
          }
        );
      } catch (error) {
        logServerError("settings-home-currency-refresh", error, {
          householdId: session!.householdId,
          homeCurrency: validated.homeCurrency,
        });
        throw new ActionError(
          "Failed to refresh home currency rates",
          "INTERNAL_ERROR"
        );
      }

      const afterRefresh = await db.query.households.findFirst({
        where: eq(households.id, session!.householdId),
      });
      if (!afterRefresh) {
        throw new ActionError("Household not found", "NOT_FOUND");
      }
      updated = afterRefresh;
    } else {
      updated = await db
        .update(households)
        .set(updateData)
        .where(eq(households.id, session!.householdId))
        .returning()
        .get();
    }

    const nameChanged =
      validated.name !== undefined && validated.name !== previous.name;

    if (nameChanged) {
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
      const householdId = session!.householdId;
      // Re-read households.name at write time so a slower waitUntil from an
      // earlier rename cannot overwrite Clerk with a stale name.
      const syncMembers = Promise.all(
        members.map(async (member) => {
          try {
            const latest = await db.query.households.findFirst({
              where: eq(households.id, householdId),
              columns: { name: true },
            });
            if (!latest) return;
            await setClerkHouseholdMetadata(clerk, member.authId, {
              householdId,
              householdName: latest.name,
            });
          } catch (error) {
            logServerError("settings-clerk-household-metadata", error, {
              householdId,
              authId: member.authId,
            });
          }
        })
      );

      const ctx = getCloudflare(loadContext).ctx;
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(syncMembers);
      } else {
        await syncMembers;
      }
    }

    return Response.json(updated);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, PATCH" },
  });
};
