import {
  and,
  eq,
  getDb,
  groceryItems,
  groceryItemTags,
  groceryTags,
  households,
  inArray,
  isNotNull,
  isNull,
  lt,
  scopeToHousehold,
  type DrizzleD1,
} from "@amigo/db";
import { getCloudflare } from "../../router-context";
import type { Env } from "../env";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
import { queueGroceryPush } from "../lib/push/queue";
import {
  ActionError,
  logServerError,
} from "../lib/errors";
import { insertManyAuditLogs, withAudit } from "../lib/audit";
import {
  checkRateLimit,
  enforceRateLimit,
  ROUTE_RATE_LIMITS,
} from "../middleware/rate-limit";
import { getSplatPath, getSplatSegments, type ApiHandler } from "./route";
import { getHomeCurrency } from "../lib/household-currency";
import {
  categorizeGroceryItem,
  groceryCategoryAi,
} from "../lib/grocery-category";

const addItemSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(100).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(255),
});

const updateTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

const updatePurchaseDateSchema = z.object({
  purchasedAt: z.coerce.date().refine(
    (date) => date <= new Date(),
    "Purchase date cannot be in the future"
  ),
});

const toggleSchema = z.object({
  purchasedAt: z.coerce.date().optional(),
});

export const handleGroceriesRequest: ApiHandler = async ({
  env,
  params,
  request,
  session,
  loadContext,
}) => {
  const path = getSplatPath(params);
  const [id, action] = getSplatSegments(params);
  const db = getDb(env.DB);

  // Run notifications (WebSocket broadcast + push) after the response is sent so
  // the client isn't blocked on a Durable Object fetch + queue write per tap.
  const ctx = getCloudflare(loadContext).ctx;
  const runAfterResponse = (task: Promise<unknown>) => {
    const settled = task.catch((err) => {
      console.warn(
        "groceries: deferred task failed",
        err instanceof Error ? err.message : err
      );
    });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(settled);
    } else {
      void settled;
    }
  };

  const broadcastUpdate = (broadcastAction: string, entityId: string) =>
    runAfterResponse(
      broadcastToHousehold(
        env,
        session!.householdId,
        { type: "GROCERY_UPDATE", action: broadcastAction, entityId },
        session!.userId
      )
    );

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:list`,
      ROUTE_RATE_LIMITS.groceries.list
    );

    const items = await db.query.groceryItems.findMany({
      where: and(
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
      with: {
        groceryItemTags: {
          with: { groceryTag: true },
        },
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: (item, { desc }) => [desc(item.createdAt)],
    });

    return Response.json(items);
  }

  if (request.method === "POST" && !path) {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:add`,
      ROUTE_RATE_LIMITS.groceries.add
    );

    const validated = addItemSchema.parse(await request.json());
    if (validated.tagIds && validated.tagIds.length > 0) {
      const validTags = await db.query.groceryTags.findMany({
        where: and(
          inArray(groceryTags.id, validated.tagIds),
          scopeToHousehold(groceryTags.householdId, session!.householdId)
        ),
      });

      if (validTags.length !== validated.tagIds.length) {
        throw new ActionError(
          "One or more tag IDs are invalid",
          "VALIDATION_ERROR"
        );
      }
    }

    const itemId = crypto.randomUUID();
    const { category } = await categorizeGroceryItem(
      groceryCategoryAi(env.AI),
      validated.name.trim(),
      { supplied: validated.category, homeCurrency: () => getHomeCurrency(db, session!.householdId) }
    );

    const item = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "grocery_items",
        recordId: itemId,
        operation: "INSERT",
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .insert(groceryItems)
          .values({
            id: itemId,
            householdId: session!.householdId,
            createdByUserId: session!.userId,
            itemName: validated.name.trim(),
            category,
          })
          .returning()
          .get()
    );

    if (!item) {
      logServerError("addItem", new Error("Insert returned empty result"), {
        householdId: session!.householdId,
      });
      throw new ActionError("Failed to create item", "NOT_FOUND");
    }

    if (validated.tagIds && validated.tagIds.length > 0) {
      await db.insert(groceryItemTags).values(
        validated.tagIds.map((tagId) => ({
          itemId: item.id,
          tagId,
        }))
      );
    }

    broadcastUpdate("create", item.id);

    runAfterResponse(
      queueGroceryPush(env, session!.householdId, {
        type: "add",
        itemName: item.itemName,
        actorUserId: session!.userId,
        actorName: session!.name ?? "Someone",
      })
    );

    return Response.json(item, { status: 201 });
  }

  if (request.method === "POST" && id && action === "toggle") {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:toggle`,
      ROUTE_RATE_LIMITS.groceries.toggle
    );

    const body = await request.json().catch(() => ({}));
    const validated = toggleSchema.parse(body);

    const existing = await db.query.groceryItems.findFirst({
      where: and(
        eq(groceryItems.id, id),
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    const newPurchasedAt = existing.isPurchased
      ? null
      : validated.purchasedAt ?? new Date();

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "grocery_items",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(groceryItems)
          .set({
            isPurchased: !existing.isPurchased,
            purchasedAt: newPurchasedAt,
          })
          .where(
            and(
              eq(groceryItems.id, id),
              scopeToHousehold(groceryItems.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    broadcastUpdate("update", id);

    if (!existing.isPurchased && updated.isPurchased) {
      runAfterResponse(
        queueGroceryPush(env, session!.householdId, {
          type: "purchase",
          itemName: existing.itemName,
          actorUserId: session!.userId,
          actorName: session!.name ?? "Someone",
        })
      );
    }

    return Response.json(updated);
  }

  if (request.method === "PATCH" && id && !action) {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:update`,
      ROUTE_RATE_LIMITS.groceries.update
    );

    const validated = updateItemSchema.parse(await request.json());
    const existing = await db.query.groceryItems.findFirst({
      where: and(
        eq(groceryItems.id, id),
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    // If Jev can't decide, leave the aisle column alone so a rename that
    // finished while this one was waiting is not overwritten. A confident
    // choice is written even when it matches the aisle we read earlier.
    const { category, decided } = await categorizeGroceryItem(
      groceryCategoryAi(env.AI),
      validated.name.trim(),
      { fallback: existing.category, homeCurrency: () => getHomeCurrency(db, session!.householdId) }
    );

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "grocery_items",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(groceryItems)
          .set({
            itemName: validated.name.trim(),
            ...(decided ? { category } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(groceryItems.id, id),
              scopeToHousehold(groceryItems.householdId, session!.householdId),
              isNull(groceryItems.deletedAt)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    broadcastUpdate("update", id);

    return Response.json(updated);
  }

  if (request.method === "PUT" && id && action === "tags") {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:tags`,
      ROUTE_RATE_LIMITS.groceries.tags
    );

    const validated = updateTagsSchema.parse(await request.json());
    const existing = await db.query.groceryItems.findFirst({
      where: and(
        eq(groceryItems.id, id),
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    if (validated.tagIds.length > 0) {
      const validTags = await db.query.groceryTags.findMany({
        where: and(
          inArray(groceryTags.id, validated.tagIds),
          scopeToHousehold(groceryTags.householdId, session!.householdId)
        ),
      });
      if (validTags.length !== validated.tagIds.length) {
        throw new ActionError(
          "One or more tag IDs are invalid",
          "VALIDATION_ERROR"
        );
      }
    }

    await db.batch([
      db.delete(groceryItemTags).where(eq(groceryItemTags.itemId, id)),
      ...(validated.tagIds.length > 0
        ? [
            db.insert(groceryItemTags).values(
              validated.tagIds.map((tagId) => ({ itemId: id, tagId }))
            ),
          ]
        : []),
    ]);

    broadcastUpdate("update", id);

    return Response.json({ success: true });
  }

  if (request.method === "PATCH" && id && action === "purchase-date") {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:updateDate`,
      ROUTE_RATE_LIMITS.groceries.updateDate
    );

    const validated = updatePurchaseDateSchema.parse(await request.json());
    const existing = await db.query.groceryItems.findFirst({
      where: and(
        eq(groceryItems.id, id),
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }
    if (!existing.isPurchased) {
      throw new ActionError(
        "Item must be marked as purchased before updating purchase date",
        "VALIDATION_ERROR"
      );
    }

    const updated = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "grocery_items",
        recordId: id,
        operation: "UPDATE",
        oldValues: existing,
        newValues: (result) => result,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(groceryItems)
          .set({
            isPurchased: true,
            purchasedAt: validated.purchasedAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(groceryItems.id, id),
              scopeToHousehold(groceryItems.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!updated) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    broadcastUpdate("update", id);

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id && !action) {
    await enforceRateLimit(
      env,
      `${session!.userId}:groceries:delete`,
      ROUTE_RATE_LIMITS.groceries.delete
    );

    const existing = await db.query.groceryItems.findFirst({
      where: and(
        eq(groceryItems.id, id),
        scopeToHousehold(groceryItems.householdId, session!.householdId),
        isNull(groceryItems.deletedAt)
      ),
    });

    if (!existing) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    const deleted = await withAudit(
      db,
      {
        householdId: session!.householdId,
        tableName: "grocery_items",
        recordId: id,
        operation: "DELETE",
        oldValues: existing,
        changedBy: session!.userId,
      },
      async () =>
        db
          .update(groceryItems)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(groceryItems.id, id),
              scopeToHousehold(groceryItems.householdId, session!.householdId)
            )
          )
          .returning()
          .get()
    );

    if (!deleted) {
      throw new ActionError("Item not found", "NOT_FOUND");
    }

    broadcastUpdate("delete", id);

    return Response.json(deleted);
  }

  if (request.method === "POST" && path === "clear-old") {
    const { allowed } = await checkRateLimit(
      env,
      `${session!.userId}:groceries:clear`,
      ROUTE_RATE_LIMITS.groceries.clear
    );
    if (!allowed) {
      return Response.json({ deleted: 0, skipped: true });
    }

    const deleted = await deleteOldPurchasedItems(
      db,
      session!.householdId,
      session!.userId,
      oldPurchaseCutoff(new Date())
    );

    return Response.json({ deleted });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, PUT, DELETE" },
  });
};

const PURCHASED_ITEM_RETENTION_DAYS = 90;

function oldPurchaseCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PURCHASED_ITEM_RETENTION_DAYS);
  return cutoff;
}

// Deliberately includes soft-deleted rows: retention removes them too, and deleted
// grocery items are never restored or sent to clients.
function isOldPurchase(cutoff: Date) {
  return and(
    eq(groceryItems.isPurchased, true),
    isNotNull(groceryItems.purchasedAt),
    lt(groceryItems.purchasedAt, cutoff)
  );
}

const PURGE_BATCH_SIZE = 50;

/**
 * Hard-deletes one household's items purchased before `cutoff` in bounded
 * batches, auditing each batch before starting the next.
 */
async function deleteOldPurchasedItems(
  db: DrizzleD1,
  householdId: string,
  changedBy: string | null,
  cutoff: Date
): Promise<number> {
  const scope = and(
    scopeToHousehold(groceryItems.householdId, householdId),
    isOldPurchase(cutoff)
  );
  let deletedCount = 0;

  while (true) {
    const deletedRows = await db
      .delete(groceryItems)
      .where(
        and(
          scope,
          inArray(
            groceryItems.id,
            db
              .select({ id: groceryItems.id })
              .from(groceryItems)
              .where(scope)
              .limit(PURGE_BATCH_SIZE)
          )
        )
      )
      .returning();

    await insertManyAuditLogs(
      db,
      deletedRows.map((row) => ({
        householdId,
        tableName: "grocery_items",
        recordId: row.id,
        operation: "DELETE",
        oldValues: row,
        changedBy,
      }))
    );

    deletedCount += deletedRows.length;
    if (deletedRows.length < PURGE_BATCH_SIZE) return deletedCount;
  }
}

/**
 * Weekly cron: clears items purchased more than 90 days ago in every household.
 * The cron has no session, so it walks the households table and runs the same
 * household-scoped delete as `POST /api/groceries/clear-old` for each one.
 */
export async function purgeOldPurchasedGroceryItems(
  env: Env,
  now = new Date()
): Promise<{ deletedCount: number }> {
  const db = getDb(env.DB);
  const cutoff = oldPurchaseCutoff(now);
  const allHouseholds = await db.select({ id: households.id }).from(households);

  let deletedCount = 0;
  // broadcastToHousehold never throws; don't hold later households on it.
  const broadcasts: Promise<void>[] = [];
  for (const { id: householdId } of allHouseholds) {
    const deleted = await deleteOldPurchasedItems(db, householdId, null, cutoff);
    deletedCount += deleted;
    if (deleted > 0) {
      broadcasts.push(
        broadcastToHousehold(env, householdId, {
          type: "GROCERY_UPDATE",
          action: "clear_old",
          count: deleted,
        })
      );
    }
  }
  await Promise.all(broadcasts);

  return { deletedCount };
}
