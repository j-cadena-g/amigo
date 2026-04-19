import {
  and,
  eq,
  getDb,
  groceryItems,
  groceryItemTags,
  groceryTags,
  inArray,
  isNotNull,
  isNull,
  lt,
  scopeToHousehold,
} from "@amigo/db";
import { z } from "zod";
import { broadcastToHousehold } from "../lib/realtime";
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

const DEFAULT_GROCERY_CATEGORY = "General";

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
}) => {
  const path = getSplatPath(params);
  const [id, action] = getSplatSegments(params);
  const db = getDb(env.DB);

  if (request.method === "GET" && !path) {
    await enforceRateLimit(
      env.CACHE,
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
      env.CACHE,
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
            category: validated.category?.trim() || DEFAULT_GROCERY_CATEGORY,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "create",
      entityId: item.id,
    });

    return Response.json(item, { status: 201 });
  }

  if (request.method === "POST" && id && action === "toggle") {
    await enforceRateLimit(
      env.CACHE,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json(updated);
  }

  if (request.method === "PATCH" && id && !action) {
    await enforceRateLimit(
      env.CACHE,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json(updated);
  }

  if (request.method === "PUT" && id && action === "tags") {
    await enforceRateLimit(
      env.CACHE,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json({ success: true });
  }

  if (request.method === "PATCH" && id && action === "purchase-date") {
    await enforceRateLimit(
      env.CACHE,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "update",
      entityId: id,
    });

    return Response.json(updated);
  }

  if (request.method === "DELETE" && id && !action) {
    await enforceRateLimit(
      env.CACHE,
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

    await broadcastToHousehold(env, session!.householdId, {
      type: "GROCERY_UPDATE",
      action: "delete",
      entityId: id,
    });

    return Response.json(deleted);
  }

  if (request.method === "POST" && path === "clear-old") {
    const { allowed } = await checkRateLimit(
      env.CACHE,
      `${session!.userId}:groceries:clear`,
      ROUTE_RATE_LIMITS.groceries.clear
    );
    if (!allowed) {
      return Response.json({ deleted: 0, skipped: true });
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const deletedRows = await db
      .delete(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session!.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          lt(groceryItems.purchasedAt, ninetyDaysAgo)
        )
      )
      .returning();

    if (deletedRows.length > 0) {
      await insertManyAuditLogs(
        db,
        deletedRows.map((row) => ({
          householdId: session!.householdId,
          tableName: "grocery_items",
          recordId: row.id,
          operation: "DELETE",
          oldValues: row,
          changedBy: session!.userId,
        }))
      );
    }

    return Response.json({ deleted: deletedRows.length });
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, POST, PATCH, PUT, DELETE" },
  });
};
