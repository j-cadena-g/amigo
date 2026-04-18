import { Hono } from "hono";
import {
  getDb,
  users,
  transactions,
  recurringTransactions,
  budgets,
  assets,
  debts,
  groceryItems,
  eq,
  and,
} from "@amigo/db";
import type { HonoEnv } from "../env";
import { ActionError } from "../lib/errors";
import { logSecurityEvent, logServerError } from "../lib/errors";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";

const RESTORE_TOKEN_PREFIX = "restore:";

export const restoreRoute = new Hono<HonoEnv>()
  /**
   * GET /pending — Check for a pending restore token.
   * Token is passed as a query param (set by auth callback redirect).
   */
  .get("/pending", async (c) => {
    const token = c.req.query("token");
    if (!token) {
      return c.json({ pending: false });
    }

    const data = await c.env.CACHE.get(`${RESTORE_TOKEN_PREFIX}${token}`, "json");
    if (!data) {
      return c.json({ pending: false });
    }

    return c.json({ pending: true, data });
  })

  /**
   * POST /restore — Reactivate user account, reconnect to previous data.
   */
  .post("/restore", async (c) => {
    await enforceRateLimit(
      c.env.CACHE,
      `restore:${c.req.header("cf-connecting-ip") ?? "unknown"}`,
      ROUTE_RATE_LIMITS.restore.restore
    );

    const body = await c.req.json<{ token: string }>();
    if (!body.token) {
      throw new ActionError("Token required", "VALIDATION_ERROR");
    }

    const restoreData = await c.env.CACHE.get(
      `${RESTORE_TOKEN_PREFIX}${body.token}`,
      "json"
    ) as { userId: string; householdId: string; email: string; name: string | null } | null;

    if (!restoreData) {
      throw new ActionError("Restore session expired", "NOT_FOUND");
    }

    try {
      const db = getDb(c.env.DB);

      // Reactivate user
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

      // Clear userDisplayName since user is back
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

      // Clean up restore token
      await c.env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);

      logSecurityEvent("account_restored", {
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
      });

      return c.json({ success: true });
    } catch (error) {
      if (error instanceof ActionError) throw error;
      logServerError("restore-account", error, {
        userId: restoreData.userId,
      });
      throw new ActionError("Failed to restore account", "VALIDATION_ERROR");
    }
  })

  /**
   * POST /fresh-start — Reactivate as member, transfer all data to household owner.
   */
  .post("/fresh-start", async (c) => {
    await enforceRateLimit(
      c.env.CACHE,
      `fresh-start:${c.req.header("cf-connecting-ip") ?? "unknown"}`,
      ROUTE_RATE_LIMITS.restore.freshStart
    );

    const body = await c.req.json<{ token: string }>();
    if (!body.token) {
      throw new ActionError("Token required", "VALIDATION_ERROR");
    }

    const restoreData = await c.env.CACHE.get(
      `${RESTORE_TOKEN_PREFIX}${body.token}`,
      "json"
    ) as { userId: string; householdId: string; email: string; name: string | null } | null;

    if (!restoreData) {
      throw new ActionError("Restore session expired", "NOT_FOUND");
    }

    try {
      const db = getDb(c.env.DB);

      // Find household owner
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

      // Reactivate user with member role
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

      // Transfer all records to owner with provenance tracking
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

      // Clean up restore token
      await c.env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);

      logSecurityEvent("account_fresh_start", {
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
        transferredToUserId: owner.id,
      });

      return c.json({ success: true });
    } catch (error) {
      if (error instanceof ActionError) throw error;
      logServerError("fresh-start-account", error, {
        userId: restoreData.userId,
      });
      throw new ActionError("Failed to start fresh", "VALIDATION_ERROR");
    }
  })

  /**
   * POST /cancel — Delete the restore token.
   */
  .post("/cancel", async (c) => {
    const body = await c.req.json<{ token: string }>();
    if (body.token) {
      await c.env.CACHE.delete(`${RESTORE_TOKEN_PREFIX}${body.token}`);
    }
    return c.json({ success: true });
  });
