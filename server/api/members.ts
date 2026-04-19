import {
  and,
  assets,
  budgets,
  debts,
  eq,
  getDb,
  groceryItems,
  isNull,
  pushSubscriptions,
  recurringTransactions,
  scopeToHousehold,
  sql,
  transactions,
  users,
} from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold, invalidateUserSession } from "../lib/realtime";
import { ActionError, logSecurityEvent } from "../lib/errors";
import {
  assertPermission,
  canChangeRole,
  canManageMembers,
  canTransferOwnership,
} from "../lib/permissions";
import { getTransferOwnershipUsers } from "../lib/member-queries";
import { invalidateSessionCachesForHouseholdMembers } from "../lib/session-cache";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, getSplatSegments, type ApiHandler } from "./route";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const handleMembersRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
}) => {
  const path = getSplatPath(params);
  const splatSegments = getSplatSegments(params);
  const [userId, action] = splatSegments;
  const db = getDb(env.DB);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:members:list`,
      ROUTE_RATE_LIMITS.members.list
    );

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          scopeToHousehold(users.householdId, session!.householdId),
          isNull(users.deletedAt)
        )
      );

    return Response.json(members);
  }

  if (
    request.method === "PATCH" &&
    userId &&
    action === "role" &&
    splatSegments.length === 2
  ) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:members:role`,
      ROUTE_RATE_LIMITS.members.role
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage members"
    );

    const { role } = updateRoleSchema.parse(await request.json());
    const targetUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, userId),
        scopeToHousehold(users.householdId, session!.householdId),
        isNull(users.deletedAt)
      ),
    });

    if (!targetUser) {
      throw new ActionError("User not found in household", "NOT_FOUND");
    }

    if (targetUser.role === "owner") {
      throw new ActionError(
        "Cannot change owner's role directly. Use ownership transfer instead.",
        "PERMISSION_DENIED"
      );
    }

    assertPermission(
      canChangeRole(session!, role, userId),
      "Not authorized to assign this role"
    );

    await db.update(users).set({ role }).where(eq(users.id, userId));

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: targetUser.authId, orgId: session!.orgId },
    ]);
    await invalidateUserSession(env, session!.householdId, userId);

    await broadcastToHousehold(env, session!.householdId, {
      type: "MEMBER_UPDATE",
      action: "role_change",
      entityId: userId,
    });

    return Response.json({ success: true });
  }

  if (request.method === "POST" && path === "transfer-ownership") {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:members:transfer`,
      ROUTE_RATE_LIMITS.members.transfer
    );
    assertPermission(
      canTransferOwnership(session!),
      "Only the owner can transfer ownership"
    );

    const { newOwnerId } = z
      .object({ newOwnerId: z.string().uuid() })
      .parse(await request.json());

    if (newOwnerId === session!.userId) {
      throw new ActionError("You are already the owner", "VALIDATION_ERROR");
    }

    const [newOwner, currentUser] = await getTransferOwnershipUsers(
      db,
      session!.householdId,
      session!.userId,
      newOwnerId
    );

    if (!newOwner) {
      throw new ActionError("User not found in household", "NOT_FOUND");
    }

    if (!currentUser) {
      throw new ActionError(
        "Session inconsistency — please sign out and back in",
        "UNAUTHORIZED"
      );
    }

    await db.batch([
      db.update(users).set({ role: "admin" }).where(eq(users.id, session!.userId)),
      db.update(users).set({ role: "owner" }).where(eq(users.id, newOwnerId)),
    ]);

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: currentUser.authId, orgId: session!.orgId },
      { authId: newOwner.authId, orgId: session!.orgId },
    ]);
    await Promise.all([
      invalidateUserSession(env, session!.householdId, session!.userId),
      invalidateUserSession(env, session!.householdId, newOwnerId),
    ]);

    logSecurityEvent("ownership_transferred", {
      fromUserId: session!.userId,
      toUserId: newOwnerId,
      householdId: session!.householdId,
    });

    await broadcastToHousehold(env, session!.householdId, {
      type: "MEMBER_UPDATE",
      action: "ownership_transfer",
    });

    return Response.json({ success: true });
  }

  if (
    request.method === "GET" &&
    userId &&
    action === "data-summary" &&
    splatSegments.length === 2
  ) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:members:summary`,
      ROUTE_RATE_LIMITS.members.summary
    );
    assertPermission(canManageMembers(session!), "Not authorized");

    const targetUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, userId),
        scopeToHousehold(users.householdId, session!.householdId),
        isNull(users.deletedAt)
      ),
    });

    if (!targetUser) {
      throw new ActionError("User not found", "NOT_FOUND");
    }

    const [
      transactionCount,
      recurringCount,
      budgetCount,
      assetCount,
      debtCount,
      groceryCount,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
        .then((result) => result[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(recurringTransactions)
        .where(eq(recurringTransactions.userId, userId))
        .then((result) => result[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(budgets)
        .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
        .then((result) => result[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(and(eq(assets.userId, userId), isNull(assets.deletedAt)))
        .then((result) => result[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(debts)
        .where(and(eq(debts.userId, userId), isNull(debts.deletedAt)))
        .then((result) => result[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(groceryItems)
        .where(
          and(eq(groceryItems.createdByUserId, userId), isNull(groceryItems.deletedAt))
        )
        .then((result) => result[0]?.count ?? 0),
    ]);

    return Response.json({
      transactions: transactionCount,
      recurringTransactions: recurringCount,
      personalBudgets: budgetCount,
      assets: assetCount,
      debts: debtCount,
      groceryItems: groceryCount,
    });
  }

  if (
    request.method === "DELETE" &&
    userId &&
    !action &&
    splatSegments.length === 1
  ) {
    await enforceRateLimit(
      env.CACHE,
      `${session!.userId}:members:remove`,
      ROUTE_RATE_LIMITS.members.remove
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to remove members"
    );

    if (userId === session!.userId) {
      throw new ActionError("Cannot remove yourself", "VALIDATION_ERROR");
    }

    const targetUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, userId),
        scopeToHousehold(users.householdId, session!.householdId),
        isNull(users.deletedAt)
      ),
    });

    if (!targetUser) {
      throw new ActionError("User not found in household", "NOT_FOUND");
    }

    if (targetUser.role === "owner") {
      throw new ActionError("Cannot remove the owner", "PERMISSION_DENIED");
    }

    if (session!.role === "admin" && targetUser.role === "admin") {
      throw new ActionError(
        "Admins cannot remove other admins",
        "PERMISSION_DENIED"
      );
    }

    const displayName = targetUser.name ?? targetUser.email;

    await db.batch([
      db
        .update(transactions)
        .set({ userDisplayName: displayName })
        .where(eq(transactions.userId, userId)),
      db
        .update(recurringTransactions)
        .set({ userDisplayName: displayName })
        .where(eq(recurringTransactions.userId, userId)),
      db
        .update(assets)
        .set({ userDisplayName: displayName })
        .where(eq(assets.userId, userId)),
      db
        .update(debts)
        .set({ userDisplayName: displayName })
        .where(eq(debts.userId, userId)),
      db
        .update(groceryItems)
        .set({ createdByUserDisplayName: displayName })
        .where(eq(groceryItems.createdByUserId, userId)),
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
      db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId)),
    ]);

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: targetUser.authId, orgId: session!.orgId },
    ]);
    await invalidateUserSession(env, session!.householdId, userId);

    logSecurityEvent("member_removed", {
      removedUserId: userId,
      removedBy: session!.userId,
      householdId: session!.householdId,
    });

    await broadcastToHousehold(env, session!.householdId, {
      type: "MEMBER_UPDATE",
      action: "removed",
      entityId: userId,
    });

    return Response.json({ success: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
