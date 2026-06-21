import { createClerkClient } from "@clerk/backend";
import { CURRENCY_CODES, eq, getDb, households, users, and, isNull, seedStarterFinancialCategories } from "@amigo/db";
import { z } from "zod";
import { isValidTimeZone } from "../lib/dates";
import {
  clearClerkHouseholdMetadata,
  setClerkHouseholdMetadata,
} from "../lib/clerk-household-metadata";
import { ActionError } from "../lib/errors";
import type { ApiHandler } from "./route";

const setupSchema = z.object({
  householdName: z.string().min(1).max(100),
  homeCurrency: z.enum(CURRENCY_CODES),
  timezone: z.string().min(1).max(64),
});

function isAuthIdUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    /(?:UNIQUE constraint failed: users\.auth_id|UNIQUE constraint failed: users\.authId)/i.test(
      error.message
    )
  );
}

async function syncClerkMetadataToExistingHousehold(
  db: ReturnType<typeof getDb>,
  clerk: ReturnType<typeof createClerkClient>,
  authUserId: string
) {
  const membership = await db
    .select({
      householdId: users.householdId,
      householdName: households.name,
    })
    .from(users)
    .innerJoin(households, eq(users.householdId, households.id))
    .where(and(eq(users.authId, authUserId), isNull(users.deletedAt)))
    .get();

  if (!membership) {
    await clearClerkHouseholdMetadata(clerk, authUserId);
    return;
  }

  await setClerkHouseholdMetadata(clerk, authUserId, {
    householdId: membership.householdId,
    householdName: membership.householdName,
  });
}

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

  try {
    await db.batch([
      db.insert(households).values({
        id: householdId,
        name: householdName,
        homeCurrency,
        timezone,
      }),
      db.insert(users).values({
        authId: auth.userId,
        email,
        name,
        householdId,
        role: "owner",
      }),
    ]);
    await seedStarterFinancialCategories(db, householdId);
  } catch (error) {
    if (isAuthIdUniqueConstraintError(error)) {
      try {
        await syncClerkMetadataToExistingHousehold(db, clerk, auth.userId);
      } catch (syncError) {
        console.error("Failed to sync Clerk metadata after auth_id race", {
          error: syncError,
          authUserId: auth.userId,
        });
      }
      throw new ActionError(
        "You already belong to a household",
        "PERMISSION_DENIED"
      );
    }

    try {
      await clearClerkHouseholdMetadata(clerk, auth.userId);
    } catch (clearError) {
      console.error("Failed to clear Clerk setup metadata after D1 batch failure", {
        error: clearError,
        authUserId: auth.userId,
        householdId,
      });
    }

    throw error;
  }

  return Response.json(
    { success: true, householdId },
    { status: 201 }
  );
};
