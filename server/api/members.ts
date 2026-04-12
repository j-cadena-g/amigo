import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import {
  getDb, users, transactions, recurringTransactions, budgets, assets, debts,
  groceryItems, pushSubscriptions, scopeToHousehold, eq, and, isNull, sql,
} from "@amigo/db";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { broadcastToHousehold, invalidateUserSession } from "../lib/realtime";
import { ActionError, logSecurityEvent } from "../lib/errors";
import { canManageMembers, canTransferOwnership, canChangeRole, assertPermission } from "../lib/permissions";
import { invalidateSessionCachesForHouseholdMembers } from "../lib/session-cache";
import { getTransferOwnershipUsers } from "../lib/member-queries";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const membersRoute = new Hono<HonoEnv>();

// List household members
membersRoute.get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:members:list`,
    ROUTE_RATE_LIMITS.members.list
  );

  const db = getDb(c.env.DB);

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
        scopeToHousehold(users.householdId, session.householdId),
        isNull(users.deletedAt)
      )
    );

  return c.json(members);
});

// Update member role
membersRoute.patch("/:userId/role", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:members:role`,
    ROUTE_RATE_LIMITS.members.role
  );
  assertPermission(canManageMembers(session), "Not authorized to manage members");

  const targetUserId = c.req.param("userId");
  const body = await c.req.json();
  const { role } = updateRoleSchema.parse(body);
  const db = getDb(c.env.DB);

  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, targetUserId),
      scopeToHousehold(users.householdId, session.householdId),
      isNull(users.deletedAt)
    ),
  });

  if (!targetUser) {
    throw new ActionError("User not found in household", "NOT_FOUND");
  }

  if (targetUser.role === "owner") {
    throw new ActionError("Cannot change owner's role directly. Use ownership transfer instead.", "PERMISSION_DENIED");
  }

  assertPermission(canChangeRole(session, role, targetUserId), "Not authorized to assign this role");

  await db.update(users).set({ role }).where(eq(users.id, targetUserId));

  await invalidateSessionCachesForHouseholdMembers(c.env, [
    { authId: targetUser.authId, orgId: session.orgId },
  ]);
  await invalidateUserSession(c.env, session.householdId, targetUserId);

  await broadcastToHousehold(c.env, session.householdId, {
    type: "MEMBER_UPDATE",
    action: "role_change",
    entityId: targetUserId,
  });

  return c.json({ success: true });
});

// Transfer ownership
membersRoute.post("/transfer-ownership", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:members:transfer`,
    ROUTE_RATE_LIMITS.members.transfer
  );
  assertPermission(canTransferOwnership(session), "Only the owner can transfer ownership");

  const { newOwnerId } = z.object({ newOwnerId: z.string().uuid() }).parse(await c.req.json());
  const db = getDb(c.env.DB);

  if (newOwnerId === session.userId) {
    throw new ActionError("You are already the owner", "VALIDATION_ERROR");
  }

  const [newOwner, currentUser] = await getTransferOwnershipUsers(
    db,
    session.householdId,
    session.userId,
    newOwnerId
  );

  if (!newOwner) {
    throw new ActionError("User not found in household", "NOT_FOUND");
  }

  // Demote current owner → admin, promote new owner
  await db.batch([
    db.update(users).set({ role: "admin" }).where(eq(users.id, session.userId)),
    db.update(users).set({ role: "owner" }).where(eq(users.id, newOwnerId)),
  ]);

  await invalidateSessionCachesForHouseholdMembers(c.env, [
    { authId: currentUser?.authId ?? null, orgId: session.orgId },
    { authId: newOwner.authId, orgId: session.orgId },
  ]);
  await Promise.all([
    invalidateUserSession(c.env, session.householdId, session.userId),
    invalidateUserSession(c.env, session.householdId, newOwnerId),
  ]);

  logSecurityEvent("ownership_transferred", {
    fromUserId: session.userId,
    toUserId: newOwnerId,
    householdId: session.householdId,
  });

  await broadcastToHousehold(c.env, session.householdId, {
    type: "MEMBER_UPDATE",
    action: "ownership_transfer",
  });

  return c.json({ success: true });
});

// Get member data summary (for removal confirmation)
membersRoute.get("/:userId/data-summary", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:members:summary`,
    ROUTE_RATE_LIMITS.members.summary
  );
  assertPermission(canManageMembers(session), "Not authorized");

  const targetUserId = c.req.param("userId");
  const db = getDb(c.env.DB);

  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, targetUserId),
      scopeToHousehold(users.householdId, session.householdId),
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
    db.select({ count: sql<number>`count(*)` }).from(transactions)
      .where(and(eq(transactions.userId, targetUserId), isNull(transactions.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(recurringTransactions)
      .where(eq(recurringTransactions.userId, targetUserId))
      .then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(budgets)
      .where(and(eq(budgets.userId, targetUserId), isNull(budgets.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(assets)
      .where(and(eq(assets.userId, targetUserId), isNull(assets.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(debts)
      .where(and(eq(debts.userId, targetUserId), isNull(debts.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(groceryItems)
      .where(and(eq(groceryItems.createdByUserId, targetUserId), isNull(groceryItems.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
  ]);

  return c.json({
    transactions: transactionCount,
    recurringTransactions: recurringCount,
    personalBudgets: budgetCount,
    assets: assetCount,
    debts: debtCount,
    groceryItems: groceryCount,
  });
});

// Remove member (soft delete + denormalize display names)
membersRoute.delete("/:userId", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:members:remove`,
    ROUTE_RATE_LIMITS.members.remove
  );
  assertPermission(canManageMembers(session), "Not authorized to remove members");

  const targetUserId = c.req.param("userId");
  const db = getDb(c.env.DB);

  if (targetUserId === session.userId) {
    throw new ActionError("Cannot remove yourself", "VALIDATION_ERROR");
  }

  const targetUser = await db.query.users.findFirst({
    where: and(
      eq(users.id, targetUserId),
      scopeToHousehold(users.householdId, session.householdId),
      isNull(users.deletedAt)
    ),
  });

  if (!targetUser) {
    throw new ActionError("User not found in household", "NOT_FOUND");
  }

  if (targetUser.role === "owner") {
    throw new ActionError("Cannot remove the owner", "PERMISSION_DENIED");
  }

  if (session.role === "admin" && targetUser.role === "admin") {
    throw new ActionError("Admins cannot remove other admins", "PERMISSION_DENIED");
  }

  const displayName = targetUser.name ?? targetUser.email;

  // Denormalize display names, delete push subs, soft-delete user
  await db.batch([
    db.update(transactions).set({ userDisplayName: displayName }).where(eq(transactions.userId, targetUserId)),
    db.update(recurringTransactions).set({ userDisplayName: displayName }).where(eq(recurringTransactions.userId, targetUserId)),
    db.update(assets).set({ userDisplayName: displayName }).where(eq(assets.userId, targetUserId)),
    db.update(debts).set({ userDisplayName: displayName }).where(eq(debts.userId, targetUserId)),
    db.update(groceryItems).set({ createdByUserDisplayName: displayName }).where(eq(groceryItems.createdByUserId, targetUserId)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, targetUserId)),
    db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, targetUserId)),
  ]);

  await invalidateSessionCachesForHouseholdMembers(c.env, [
    { authId: targetUser.authId, orgId: session.orgId },
  ]);
  await invalidateUserSession(c.env, session.householdId, targetUserId);

  logSecurityEvent("member_removed", {
    removedUserId: targetUserId,
    removedBy: session.userId,
    householdId: session.householdId,
  });

  await broadcastToHousehold(c.env, session.householdId, {
    type: "MEMBER_UPDATE",
    action: "removed",
    entityId: targetUserId,
  });

  return c.json({ success: true });
});
