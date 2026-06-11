import {
  and,
  assets,
  budgets,
  debts,
  eq,
  getDb,
  groceryItems,
  households,
  isNotNull,
  recurringTransactions,
  transactions,
  users,
} from "@amigo/db";
import { getClerkIdentity } from "../lib/clerk";
import { ActionError, logSecurityEvent, logServerError } from "../lib/errors";
import { invalidateSessionCache } from "../lib/session-cache";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, type ApiHandler } from "./route";

async function findSoftDeletedUser(
  db: ReturnType<typeof getDb>,
  authId: string,
  orgId: string
) {
  const household = await db
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(eq(households.clerkOrgId, orgId))
    .get();

  if (!household) {
    return null;
  }

  const user = await db
    .select({
      id: users.id,
      householdId: users.householdId,
      email: users.email,
      name: users.name,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(
      and(
        eq(users.authId, authId),
        eq(users.householdId, household.id),
        isNotNull(users.deletedAt)
      )
    )
    .get();

  if (!user) {
    return null;
  }

  return { user, household };
}

export const handleRestoreRequest: ApiHandler = async ({
  env,
  params,
  request,
  auth,
}) => {
  const path = getSplatPath(params);
  const identity = getClerkIdentity(auth);
  if (!identity?.userId || !identity.orgId) {
    throw new ActionError("Unauthorized", "UNAUTHORIZED");
  }

  const rateLimitKey = identity.userId;

  if (request.method === "GET" && path === "pending") {
    await enforceRateLimit(
      env,
      `${rateLimitKey}:restore:pending`,
      ROUTE_RATE_LIMITS.restore.pending
    );

    const db = getDb(env.DB);
    const match = await findSoftDeletedUser(db, identity.userId, identity.orgId);

    if (!match) {
      return Response.json({ pending: false });
    }

    return Response.json({
      pending: true,
      householdName: match.household.name,
    });
  }

  if (request.method === "POST" && path === "restore") {
    await enforceRateLimit(
      env,
      `${rateLimitKey}:restore:restore`,
      ROUTE_RATE_LIMITS.restore.restore
    );

    try {
      const db = getDb(env.DB);
      const match = await findSoftDeletedUser(db, identity.userId, identity.orgId);

      if (!match) {
        throw new ActionError("No pending restore found", "NOT_FOUND");
      }

      const email = identity.email ?? match.user.email;
      const name = identity.name ?? match.user.name;

      const [user] = await db
        .update(users)
        .set({
          deletedAt: null,
          email,
          name,
        })
        .where(eq(users.id, match.user.id))
        .returning();

      if (!user) {
        throw new ActionError("User not found", "NOT_FOUND");
      }

      await db.batch([
        db
          .update(transactions)
          .set({ userDisplayName: null })
          .where(eq(transactions.userId, user.id)),
        db
          .update(recurringTransactions)
          .set({ userDisplayName: null })
          .where(eq(recurringTransactions.userId, user.id)),
        db
          .update(assets)
          .set({ userDisplayName: null })
          .where(eq(assets.userId, user.id)),
        db
          .update(debts)
          .set({ userDisplayName: null })
          .where(eq(debts.userId, user.id)),
        db
          .update(groceryItems)
          .set({ createdByUserDisplayName: null })
          .where(eq(groceryItems.createdByUserId, user.id)),
      ]);

      await invalidateSessionCache(env.CACHE, identity.userId, identity.orgId);

      logSecurityEvent("account_restored", {
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
      });

      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof ActionError) throw error;
      logServerError("restore-account", error, {
        authId: identity.userId,
      });
      throw new ActionError("Failed to restore account", "INTERNAL_ERROR");
    }
  }

  if (request.method === "POST" && path === "fresh-start") {
    await enforceRateLimit(
      env,
      `${rateLimitKey}:restore:fresh-start`,
      ROUTE_RATE_LIMITS.restore.freshStart
    );

    try {
      const db = getDb(env.DB);
      const match = await findSoftDeletedUser(db, identity.userId, identity.orgId);

      if (!match) {
        throw new ActionError("No pending restore found", "NOT_FOUND");
      }

      const owner = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.householdId, match.household.id),
            eq(users.role, "owner")
          )
        )
        .get();

      if (!owner) {
        throw new ActionError("Household owner not found", "NOT_FOUND");
      }

      const email = identity.email ?? match.user.email;
      const name = identity.name ?? match.user.name;

      const [user] = await db
        .update(users)
        .set({
          deletedAt: null,
          email,
          name,
          role: "member",
        })
        .where(eq(users.id, match.user.id))
        .returning();

      if (!user) {
        throw new ActionError("User not found", "NOT_FOUND");
      }

      await db.batch([
        db
          .update(transactions)
          .set({ userId: owner.id, transferredFromUserId: user.id })
          .where(eq(transactions.userId, user.id)),
        db
          .update(recurringTransactions)
          .set({ userId: owner.id, transferredFromUserId: user.id })
          .where(eq(recurringTransactions.userId, user.id)),
        db
          .update(budgets)
          .set({ userId: owner.id, transferredFromUserId: user.id })
          .where(eq(budgets.userId, user.id)),
        db
          .update(assets)
          .set({ userId: owner.id, transferredFromUserId: user.id })
          .where(eq(assets.userId, user.id)),
        db
          .update(debts)
          .set({ userId: owner.id, transferredFromUserId: user.id })
          .where(eq(debts.userId, user.id)),
        db
          .update(groceryItems)
          .set({
            createdByUserId: owner.id,
            transferredFromCreatedByUserId: user.id,
          })
          .where(eq(groceryItems.createdByUserId, user.id)),
      ]);

      await invalidateSessionCache(env.CACHE, identity.userId, identity.orgId);

      logSecurityEvent("account_fresh_start", {
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
        transferredToUserId: owner.id,
      });

      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof ActionError) throw error;
      logServerError("fresh-start-account", error, {
        authId: identity.userId,
      });
      throw new ActionError("Failed to start fresh", "INTERNAL_ERROR");
    }
  }

  const allowedMethods =
    path === "pending" ? "GET" : path === "restore" || path === "fresh-start" ? "POST" : null;

  if (!allowedMethods) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: allowedMethods },
  });
};
