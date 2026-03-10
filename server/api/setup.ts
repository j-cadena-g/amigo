import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { createClerkClient } from "@clerk/backend";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, households, users, eq, CURRENCY_CODES } from "@amigo/db";

const setupSchema = z.object({
  householdName: z.string().min(1).max(100),
  homeCurrency: z.enum(CURRENCY_CODES),
});

export const setupRoute = new Hono<HonoEnv>();

/**
 * POST /api/setup — Create household + first user for a Clerk org.
 * This endpoint does NOT use resolveAppSession since the household doesn't exist yet.
 * It authenticates directly via Clerk and requires an active org.
 */
setupRoute.post("/", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId || !auth.orgId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(c.env.DB);

  // Prevent duplicate setup
  const existing = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.clerkOrgId, auth.orgId))
    .get();

  if (existing) {
    return c.json({ error: "Household already exists for this organization" }, 409);
  }

  const body = await c.req.json();
  const { householdName, homeCurrency } = setupSchema.parse(body);

  // Create household linked to Clerk org
  const household = await db
    .insert(households)
    .values({
      clerkOrgId: auth.orgId,
      name: householdName,
      homeCurrency,
    })
    .returning()
    .get();

  // Fetch user details from Clerk Backend API (JWT claims don't include email/name by default)
  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
  const clerkUser = await clerk.users.getUser(auth.userId);
  const email = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? "unknown@example.com";
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  // Create the first user as owner
  await db
    .insert(users)
    .values({
      authId: auth.userId,
      email,
      name,
      householdId: household.id,
      role: "owner",
    });

  return c.json({ success: true, householdId: household.id }, 201);
});
