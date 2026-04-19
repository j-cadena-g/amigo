import { createClerkClient } from "@clerk/backend";
import { CURRENCY_CODES, eq, getDb, households, users } from "@amigo/db";
import { z } from "zod";
import { ActionError } from "../lib/errors";
import type { ApiHandler } from "./route";

const setupSchema = z.object({
  householdName: z.string().min(1).max(100),
  homeCurrency: z.enum(CURRENCY_CODES),
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

  if (!auth?.userId || !auth.orgId) {
    throw new ActionError("Unauthorized", "UNAUTHORIZED");
  }

  const db = getDb(env.DB);

  const existing = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.clerkOrgId, auth.orgId))
    .get();

  if (existing) {
    return Response.json(
      { error: "Household already exists for this organization" },
      { status: 409 }
    );
  }

  const { householdName, homeCurrency } = setupSchema.parse(
    await request.json()
  );

  const household = await db
    .insert(households)
    .values({
      clerkOrgId: auth.orgId,
      name: householdName,
      homeCurrency,
    })
    .returning()
    .get();

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const clerkUser = await clerk.users.getUser(auth.userId);
  const email =
    clerkUser.emailAddresses.find(
      (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? "unknown@example.com";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

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
