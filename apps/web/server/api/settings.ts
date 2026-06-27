import { eq, getDb, households } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import { isValidTimeZone } from "../lib/dates";
import { assertPermission, canManageSharedBudgets } from "../lib/permissions";
import { assertSessionStillValid } from "../lib/session";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";

const patchSettingsSchema = z.object({
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

    if (validated.timezone !== undefined && !isValidTimeZone(validated.timezone)) {
      throw new ActionError("Invalid timezone", "VALIDATION_ERROR");
    }

    const updateData: Pick<typeof households.$inferInsert, "timezone" | "updatedAt"> = {
      updatedAt: new Date(),
    };
    if (validated.timezone !== undefined) {
      updateData.timezone = validated.timezone;
    }

    const updated = await db
      .update(households)
      .set(updateData)
      .where(eq(households.id, session!.householdId))
      .returning()
      .get();

    return Response.json(updated);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, PATCH" },
  });
};
