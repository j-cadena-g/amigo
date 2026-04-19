import {
  and,
  assets,
  budgets,
  debts,
  eq,
  getDb,
  groceryItems,
  recurringTransactions,
  transactions,
  users,
} from "@amigo/db";
import { ActionError, logSecurityEvent, logServerError } from "../lib/errors";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { getSplatPath, type ApiHandler } from "./route";

const RESTORE_TOKEN_PREFIX = "restore:";

export const handleRestoreRequest: ApiHandler = async ({
  env,
  params,
  request,
}) => {
  const path = getSplatPath(params);

  if (request.method === "GET" && path === "pending") {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return Response.json({ pending: false });
    }

    const data = await env.CACHE.get(`${RESTORE_TOKEN_PREFIX}${token}`, "json");
    if (!data) {
      return Response.json({ pending: false });
    }

    return Response.json({ pending: true, data });
  }

  if (request.method === "POST" && path === "restore") {
    await enforceRateLimit(
      env.CACHE,
      `restore:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
      ROUTE_RATE_LIMITS.restore.restore
    );

    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      throw new ActionError("Token required", "VALIDATION_ERROR");
    }

    const restoreData = (await env.CACHE.get(
      `${RESTORE_TOKEN_PREFIX}${body.token}`,
      "json"
    )) as
      | {
          userId: string;
          householdId: string;
          email: string;
          name: string | null;
        }
      | null;

    if (!restoreData) {
      throw new ActionError("Restore session expired", "NOT_FOUND");
    }

    try {
      const db = getDb(env.DB);

      const [user] = await db
        .update(users)
        .set({
          deletedAt: null,
          email: restoreData.email,
          name: restoreData.name,
        })
        .where(eq(users.id, restoreData.userId))
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

      await env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);

      logSecurityEvent("account_restored", {
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
      });

      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof ActionError) throw error;
      logServerError("restore-account", error, {
        userId: restoreData.userId,
      });
      throw new ActionError("Failed to restore account", "VALIDATION_ERROR");
    }
  }

  if (request.method === "POST" && path === "fresh-start") {
    await enforceRateLimit(
      env.CACHE,
      `fresh-start:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
      ROUTE_RATE_LIMITS.restore.freshStart
    );

    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      throw new ActionError("Token required", "VALIDATION_ERROR");
    }

    const restoreData = (await env.CACHE.get(
      `${RESTORE_TOKEN_PREFIX}${body.token}`,
      "json"
    )) as
      | {
          userId: string;
          householdId: string;
          email: string;
          name: string | null;
        }
      | null;

    if (!restoreData) {
      throw new ActionError("Restore session expired", "NOT_FOUND");
    }

    try {
      const db = getDb(env.DB);

      const owner = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.householdId, restoreData.householdId),
            eq(users.role, "owner")
          )
        )
        .get();

      if (!owner) {
        throw new ActionError("Household owner not found", "NOT_FOUND");
      }

      const [user] = await db
        .update(users)
        .set({
          deletedAt: null,
          email: restoreData.email,
          name: restoreData.name,
          role: "member",
        })
        .where(eq(users.id, restoreData.userId))
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

      await env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);

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
        userId: restoreData.userId,
      });
      throw new ActionError("Failed to start fresh", "VALIDATION_ERROR");
    }
  }

  if (request.method === "POST" && path === "cancel") {
    const body = (await request.json()) as { token?: string };
    if (body.token) {
      await env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);
    }
    return Response.json({ success: true });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
};
