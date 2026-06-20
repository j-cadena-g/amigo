import { createClerkClient } from "@clerk/backend";
import { CURRENCY_CODES, eq, getDb, households, users, and, isNull } from "@amigo/db";
import { z } from "zod";
import { isValidTimeZone } from "../lib/dates";
import { setClerkHouseholdMetadata } from "../lib/clerk-household-metadata";
import { ActionError } from "../lib/errors";
import type { ApiHandler } from "./route";

const setupSchema = z.object({
  householdName: z.string().min(1).max(100),
  homeCurrency: z.enum(CURRENCY_CODES),
  timezone: z.string().min(1).max(64),
});

export const handleSetupRequest: ApiHandler = async ({
  auth,
  env,
  request,
}) => {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  if (!auth?.userId) {
    throw new ActionError("Unauthorized", "UNAUTHORIZED");
  }

  const db = getDb(env.DB);

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.authId, auth.userId), isNull(users.deletedAt)))
    .get();

  if (existingUser) {
    throw new ActionError(
      "You already belong to a household",
      "PERMISSION_DENIED"
    );
  }

  const { householdName, homeCurrency, timezone } = setupSchema.parse(
    await request.json()
  );

  if (!isValidTimeZone(timezone)) {
    throw new ActionError("Invalid timezone", "VALIDATION_ERROR");
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const clerkUser = await clerk.users.getUser(auth.userId);
  const email =
    clerkUser.emailAddresses.find(
      (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? "unknown@example.com";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  const householdId = crypto.randomUUID();

  await setClerkHouseholdMetadata(clerk, auth.userId, {
    householdId,
    householdName,
  });

  const household = await db
    .insert(households)
    .values({
      id: householdId,
      name: householdName,
      homeCurrency,
      timezone,
    })
    .returning()
    .get();

  await db.insert(users).values({
    authId: auth.userId,
    email,
    name,
    householdId: household.id,
    role: "owner",
  });

  return Response.json(
    { success: true, householdId: household.id },
    { status: 201 }
  );
};
