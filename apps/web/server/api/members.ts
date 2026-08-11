import { createClerkClient } from "@clerk/backend";
import {
  and,
  assets,
  budgets,
  debts,
  eq,
  getDb,
  groceryItems,
  households,
  isNull,
  ne,
  recurringTransactions,
  scopeToHousehold,
  sql,
  transactions,
  users,
} from "@amigo/db";
import { z } from "zod";
import {
  clearClerkHouseholdMetadata,
  setClerkHouseholdMetadata,
} from "../lib/clerk-household-metadata";
import { broadcastToHousehold, invalidateUserSession } from "../lib/realtime";
import { ActionError, logSecurityEvent, logServerError } from "../lib/errors";
import {
  claimNonOwnerSoftDelete,
  cleanupDepartedMemberData,
  restoreSoftDeleteClaim,
  type SoftDeleteClaim,
} from "../lib/member-lifecycle";
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
import { insertManyAuditLogs, withAudit } from "../lib/audit";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

async function restoreMembershipAfterCleanupFailure(options: {
  db: ReturnType<typeof getDb>;
  clerk: ReturnType<typeof createClerkClient>;
  claim: SoftDeleteClaim;
  authId: string;
  logContext: string;
}) {
  const { db, clerk, claim, authId, logContext } = options;
  try {
    const household = await db.query.households.findFirst({
      where: eq(households.id, claim.householdId),
      columns: { name: true },
    });
    if (household) {
      await setClerkHouseholdMetadata(clerk, authId, {
        householdId: claim.householdId,
        householdName: household.name,
      });
    }
  } catch (clerkRestoreError) {
    logServerError(`${logContext}-clerk-restore`, clerkRestoreError, {
      householdId: claim.householdId,
      userId: claim.userId,
    });
  }
  await restoreSoftDeleteClaim(db, claim);
}

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

    await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "users",
        recordId: userId,
        operation: "UPDATE",
        oldValues: { role: targetUser.role },
        newValues: { role },
        changedBy: session!.userId,
      },
      async () => {
        await db.update(users).set({ role }).where(eq(users.id, userId));
        return { role };
      }
    );

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

      // Roles may have changed either way; drop cached sessions before failing.
      await invalidateSessionCachesForHouseholdMembers(env, [
        { authId: currentUser.authId },
        { authId: newOwner.authId },
      ]);
      await Promise.all([
        invalidateUserSession(env, householdId, currentOwnerId),
        invalidateUserSession(env, householdId, newOwnerId),
      ]);

      if (!promotedOwner || promotedOwner.deletedAt != null) {
        throw new ActionError("User not found in household", "NOT_FOUND");
      }

      throw new ActionError(
        "Ownership transfer failed — please retry",
        "CONFLICT"
      );
    }

    await insertManyAuditLogs(db, [
      {
        householdId,
        tableName: "users",
        recordId: newOwnerId,
        operation: "UPDATE",
        oldValues: { role: previousNewOwnerRole },
        newValues: { role: "owner" },
        changedBy: currentOwnerId,
      },
      {
        householdId,
        tableName: "users",
        recordId: currentOwnerId,
        operation: "UPDATE",
        oldValues: { role: "owner" },
        newValues: { role: "admin" },
        changedBy: currentOwnerId,
      },
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
        .where(
          and(
            eq(recurringTransactions.userId, userId),
            isNull(recurringTransactions.deletedAt)
          )
        )
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

    // Soft-delete first under a non-owner constraint so a concurrent ownership
    // transfer cannot remove the new owner. Clerk then cleanup; Clerk first so
    // a metadata failure can restore without dropping push subscriptions.
    const claim = await claimNonOwnerSoftDelete(
      db,
      userId,
      session!.householdId
    );

    if (!claim) {
      throw new ActionError(
        "Cannot remove this member — they may have become the owner",
        "CONFLICT"
      );
    }

    try {
      await clearClerkHouseholdMetadata(clerk, targetUser.authId);
    } catch (error) {
      await restoreSoftDeleteClaim(db, claim);
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

    try {
      await cleanupDepartedMemberData(db, userId, displayName);
    } catch (error) {
      await restoreMembershipAfterCleanupFailure({
        db,
        clerk,
        claim,
        authId: targetUser.authId,
        logContext: "remove-member",
      });
      throw error;
    }

    await insertManyAuditLogs(db, [
      {
        householdId: session!.householdId,
        tableName: "users",
        recordId: userId,
        operation: "DELETE",
        oldValues: {
          id: targetUser.id,
          role: targetUser.role,
          email: targetUser.email,
        },
        changedBy: session!.userId,
      },
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

    // Same claim → Clerk → cleanup policy as admin removal so Clerk failures
    // restore membership instead of leaving a soft-deleted row.
    const claim = await claimNonOwnerSoftDelete(
      db,
      leavingUserId,
      session!.householdId
    );

    if (!claim) {
      throw new ActionError(
        "Owners must transfer ownership before leaving the household",
        "PERMISSION_DENIED"
      );
    }

    try {
      await clearClerkHouseholdMetadata(clerk, currentUser.authId);
    } catch (error) {
      await restoreSoftDeleteClaim(db, claim);
      logServerError("leave-household-clerk-metadata", error, {
        householdId: session!.householdId,
        userId: leavingUserId,
      });
      throw new ActionError(
        "Failed to clear household metadata from Clerk user",
        "INTERNAL_ERROR"
      );
    }

    try {
      await cleanupDepartedMemberData(db, leavingUserId, displayName);
    } catch (error) {
      await restoreMembershipAfterCleanupFailure({
        db,
        clerk,
        claim,
        authId: currentUser.authId,
        logContext: "leave-household",
      });
      throw error;
    }

    await insertManyAuditLogs(db, [
      {
        householdId: session!.householdId,
        tableName: "users",
        recordId: leavingUserId,
        operation: "DELETE",
        oldValues: {
          id: currentUser.id,
          role: currentUser.role,
          email: currentUser.email,
        },
        changedBy: leavingUserId,
      },
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

    return Response.json({ success: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, DELETE" },
  });
};
