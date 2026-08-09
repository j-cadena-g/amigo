import { createClerkClient } from "@clerk/backend";
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
import { clearClerkHouseholdMetadata } from "../lib/clerk-household-metadata";
import { broadcastToHousehold, invalidateUserSession } from "../lib/realtime";
import { ActionError, logSecurityEvent, logServerError } from "../lib/errors";
import {
  assertPermission,
  canChangeRole,
  canManageMembers,
  canTransferOwnership,
} from "../lib/permissions";
import { getTransferOwnershipUsers } from "../lib/member-queries";
import { invalidateSessionCachesForHouseholdMembers } from "../lib/session-cache";
import { assertSessionStillValid } from "../lib/session";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, getSplatSegments, type ApiHandler } from "./route";

const RESTORE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

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
      env,
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
      env,
      `${session!.userId}:members:role`,
      ROUTE_RATE_LIMITS.members.role
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to manage members"
    );
    await assertSessionStillValid(db, session!);

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

    if (session!.role === "admin" && targetUser.role === "admin") {
      throw new ActionError(
        "Admins cannot change another admin's role",
        "PERMISSION_DENIED"
      );
    }

    assertPermission(
      canChangeRole(session!, role, userId),
      "Not authorized to assign this role"
    );

    await db.update(users).set({ role }).where(eq(users.id, userId));

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: targetUser.authId },
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
      env,
      `${session!.userId}:members:transfer`,
      ROUTE_RATE_LIMITS.members.transfer
    );
    assertPermission(
      canTransferOwnership(session!),
      "Only the owner can transfer ownership"
    );
    await assertSessionStillValid(db, session!);

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
      { authId: currentUser.authId },
      { authId: newOwner.authId },
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
      env,
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
      env,
      `${session!.userId}:members:remove`,
      ROUTE_RATE_LIMITS.members.remove
    );
    assertPermission(
      canManageMembers(session!),
      "Not authorized to remove members"
    );
    await assertSessionStillValid(db, session!);

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
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

    try {
      await clearClerkHouseholdMetadata(clerk, targetUser.authId);
    } catch (error) {
      logServerError("remove-member-clerk-metadata", error, {
        householdId: session!.householdId,
        removedUserId: userId,
        removedBy: session!.userId,
      });
      throw new ActionError(
        "Failed to clear household metadata from Clerk user",
        "INTERNAL_ERROR"
      );
    }

    const restoreAllowedUntil = new Date(Date.now() + RESTORE_GRACE_MS);

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
      db
        .update(users)
        .set({ deletedAt: new Date(), restoreAllowedUntil })
        .where(eq(users.id, userId)),
    ]);

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: targetUser.authId },
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

  if (request.method === "POST" && path === "leave") {
    await enforceRateLimit(
      env,
      `${session!.userId}:members:leave`,
      ROUTE_RATE_LIMITS.members.leave
    );

    if (session!.role === "owner") {
      throw new ActionError(
        "Owners must transfer ownership before leaving the household",
        "PERMISSION_DENIED"
      );
    }

    await assertSessionStillValid(db, session!);

    const currentUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, session!.userId),
        scopeToHousehold(users.householdId, session!.householdId),
        isNull(users.deletedAt)
      ),
    });

    if (!currentUser) {
      throw new ActionError(
        "Session inconsistency — please sign out and back in",
        "UNAUTHORIZED"
      );
    }

    const displayName = currentUser.name ?? currentUser.email;
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const leavingUserId = session!.userId;
    const restoreAllowedUntil = new Date(Date.now() + RESTORE_GRACE_MS);

    try {
      await clearClerkHouseholdMetadata(clerk, currentUser.authId);
    } catch (error) {
      logServerError("leave-household-clerk-metadata", error, {
        householdId: session!.householdId,
        userId: leavingUserId,
      });
      throw new ActionError(
        "Failed to clear household metadata from Clerk user",
        "INTERNAL_ERROR"
      );
    }

    await db.batch([
      db
        .update(transactions)
        .set({ userDisplayName: displayName })
        .where(eq(transactions.userId, leavingUserId)),
      db
        .update(recurringTransactions)
        .set({ userDisplayName: displayName })
        .where(eq(recurringTransactions.userId, leavingUserId)),
      db
        .update(assets)
        .set({ userDisplayName: displayName })
        .where(eq(assets.userId, leavingUserId)),
      db
        .update(debts)
        .set({ userDisplayName: displayName })
        .where(eq(debts.userId, leavingUserId)),
      db
        .update(groceryItems)
        .set({ createdByUserDisplayName: displayName })
        .where(eq(groceryItems.createdByUserId, leavingUserId)),
      db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, leavingUserId)),
      db
        .update(users)
        .set({ deletedAt: new Date(), restoreAllowedUntil })
        .where(eq(users.id, leavingUserId)),
    ]);

    await invalidateSessionCachesForHouseholdMembers(env, [
      { authId: currentUser.authId },
    ]);
    await invalidateUserSession(env, session!.householdId, leavingUserId);

    logSecurityEvent("member_left", {
      userId: leavingUserId,
      householdId: session!.householdId,
    });

    await broadcastToHousehold(env, session!.householdId, {
      type: "MEMBER_UPDATE",
      action: "removed",
      entityId: leavingUserId,
    });

    return Response.json({ ok: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
