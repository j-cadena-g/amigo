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
  ne,
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

    if (currentUser.role !== "owner") {
      throw new ActionError(
        "Only the owner can transfer ownership",
        "PERMISSION_DENIED"
      );
    }

    if (newOwner.role === "owner") {
      throw new ActionError("User is already the owner", "VALIDATION_ERROR");
    }

    const previousNewOwnerRole = newOwner.role;
    const householdId = session!.householdId;
    const currentOwnerId = session!.userId;

    // One D1 batch: promote only while the current owner is still active, then
    // demote only once the new owner row is owner (sees prior statement).
    await db.batch([
      db
        .update(users)
        .set({ role: "owner" })
        .where(
          and(
            eq(users.id, newOwnerId),
            scopeToHousehold(users.householdId, householdId),
            isNull(users.deletedAt),
            ne(users.role, "owner"),
            sql`exists (
              select 1 from users as current_owner
              where current_owner.id = ${currentOwnerId}
                and current_owner.household_id = ${householdId}
                and current_owner.deleted_at is null
                and current_owner.role = 'owner'
            )`
          )
        ),
      db
        .update(users)
        .set({ role: "admin" })
        .where(
          and(
            eq(users.id, currentOwnerId),
            scopeToHousehold(users.householdId, householdId),
            isNull(users.deletedAt),
            eq(users.role, "owner"),
            sql`exists (
              select 1 from users as next_owner
              where next_owner.id = ${newOwnerId}
                and next_owner.household_id = ${householdId}
                and next_owner.deleted_at is null
                and next_owner.role = 'owner'
            )`
          )
        ),
    ]);

    const [promotedOwner, demotedOwner] = await Promise.all([
      db
        .select({ role: users.role, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, newOwnerId))
        .get(),
      db
        .select({ role: users.role, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, currentOwnerId))
        .get(),
    ]);

    const transferOk =
      promotedOwner?.role === "owner" &&
      promotedOwner.deletedAt == null &&
      demotedOwner?.role === "admin" &&
      demotedOwner.deletedAt == null;

    if (!transferOk) {
      try {
        // Only demote the new owner when the former owner is still an active
        // admin — otherwise a concurrent leave/role change can leave zero owners.
        await db.batch([
          db
            .update(users)
            .set({ role: previousNewOwnerRole })
            .where(
              and(
                eq(users.id, newOwnerId),
                scopeToHousehold(users.householdId, householdId),
                eq(users.role, "owner"),
                sql`exists (
                  select 1 from users as former_owner
                  where former_owner.id = ${currentOwnerId}
                    and former_owner.household_id = ${householdId}
                    and former_owner.deleted_at is null
                    and former_owner.role = 'admin'
                )`
              )
            ),
          db
            .update(users)
            .set({ role: "owner" })
            .where(
              and(
                eq(users.id, currentOwnerId),
                scopeToHousehold(users.householdId, householdId),
                isNull(users.deletedAt),
                ne(users.role, "owner"),
                sql`not exists (
                  select 1 from users as other_owner
                  where other_owner.household_id = ${householdId}
                    and other_owner.id != ${currentOwnerId}
                    and other_owner.deleted_at is null
                    and other_owner.role = 'owner'
                )`
              )
            ),
        ]);
      } catch (rollbackError) {
        logServerError("transfer-ownership-rollback", rollbackError, {
          householdId,
          currentOwnerId,
          newOwnerId,
        });
      }

      if (!promotedOwner || promotedOwner.deletedAt != null) {
        throw new ActionError("User not found in household", "NOT_FOUND");
      }

      throw new ActionError(
        "Ownership transfer failed — please retry",
        "CONFLICT"
      );
    }

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

    if (currentUser.role === "owner") {
      throw new ActionError(
        "Owners must transfer ownership before leaving the household",
        "PERMISSION_DENIED"
      );
    }

    const displayName = currentUser.name ?? currentUser.email;
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const leavingUserId = session!.userId;
    const restoreAllowedUntil = new Date(Date.now() + RESTORE_GRACE_MS);

    // Soft-delete first under a non-owner constraint so a concurrent ownership
    // transfer cannot soft-delete an owner. Cleanup runs only after a successful
    // claim; on cleanup failure, undelete so leave is not half-applied.
    const left = await db
      .update(users)
      .set({ deletedAt: new Date(), restoreAllowedUntil })
      .where(
        and(
          eq(users.id, leavingUserId),
          scopeToHousehold(users.householdId, session!.householdId),
          isNull(users.deletedAt),
          ne(users.role, "owner")
        )
      )
      .returning({ id: users.id })
      .get();

    if (!left) {
      throw new ActionError(
        "Owners must transfer ownership before leaving the household",
        "PERMISSION_DENIED"
      );
    }

    try {
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
      ]);
    } catch (error) {
      await db
        .update(users)
        .set({ deletedAt: null, restoreAllowedUntil: null })
        .where(eq(users.id, leavingUserId));
      throw error;
    }

    try {
      await clearClerkHouseholdMetadata(clerk, currentUser.authId);
    } catch (error) {
      logServerError("leave-household-clerk-metadata", error, {
        householdId: session!.householdId,
        userId: leavingUserId,
      });
      // Membership already removed in D1 (source of truth).
    }

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

    return Response.json({ success: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
