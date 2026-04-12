import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../env";
import { getDb, groceryItems, groceryItemTags, groceryTags, scopeToHousehold, eq, and, inArray, isNull, isNotNull, lt } from "@amigo/db";
import { enforceRateLimit, checkRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import { broadcastToHousehold } from "../lib/realtime";
import { ActionError, logServerError } from "../lib/errors";
import { insertManyAuditLogs, withAudit } from "../lib/audit";

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

export const groceriesRoute = new Hono<HonoEnv>();

// List grocery items
groceriesRoute.get("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:list`,
    ROUTE_RATE_LIMITS.groceries.list
  );

  const db = getDb(c.env.DB);

  const items = await db.query.groceryItems.findMany({
    where: and(
      scopeToHousehold(groceryItems.householdId, session.householdId),
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
    orderBy: (items, { desc }) => [desc(items.createdAt)],
  });

  return c.json(items);
});

// Add item
groceriesRoute.post("/", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:add`,
    ROUTE_RATE_LIMITS.groceries.add
  );

  const body = await c.req.json();
  const validated = addItemSchema.parse(body);
  const db = getDb(c.env.DB);

  const itemId = crypto.randomUUID();
  const item = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "grocery_items",
      recordId: itemId,
      operation: "INSERT",
      newValues: (result) => result,
      changedBy: session.userId,
    },
    async () =>
      db
        .insert(groceryItems)
        .values({
          id: itemId,
          householdId: session.householdId,
          createdByUserId: session.userId,
          itemName: validated.name.trim(),
          category: validated.category?.trim() || DEFAULT_GROCERY_CATEGORY,
        })
        .returning()
        .get()
  );

  if (!item) {
    logServerError("addItem", new Error("Insert returned empty result"), { householdId: session.householdId });
    throw new ActionError("Failed to create item", "NOT_FOUND");
  }

  if (validated.tagIds && validated.tagIds.length > 0) {
    // Verify all tags belong to this household
    const validTags = await db.query.groceryTags.findMany({
      where: and(
        inArray(groceryTags.id, validated.tagIds),
        scopeToHousehold(groceryTags.householdId, session.householdId)
      ),
    });
    if (validTags.length !== validated.tagIds.length) {
      throw new ActionError("One or more tag IDs are invalid", "VALIDATION_ERROR");
    }

    await db.insert(groceryItemTags).values(
      validated.tagIds.map((tagId) => ({
        itemId: item.id,
        tagId,
      }))
    );
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "create",
    entityId: item.id,
  });

  return c.json(item, 201);
});

// Toggle purchased
groceriesRoute.post("/:id/toggle", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:toggle`,
    ROUTE_RATE_LIMITS.groceries.toggle
  );

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const validated = toggleSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      scopeToHousehold(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  const newPurchasedAt = existing.isPurchased ? null : (validated.purchasedAt ?? new Date());

  const updated = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "grocery_items",
      recordId: id,
      operation: "UPDATE",
      oldValues: existing,
      newValues: (result) => result,
      changedBy: session.userId,
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
            scopeToHousehold(groceryItems.householdId, session.householdId)
          )
        )
        .returning()
        .get()
  );

  if (!updated) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
  });

  return c.json(updated);
});

// Update item name
groceriesRoute.patch("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:update`,
    ROUTE_RATE_LIMITS.groceries.update
  );

  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updateItemSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      scopeToHousehold(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  const updated = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "grocery_items",
      recordId: id,
      operation: "UPDATE",
      oldValues: existing,
      newValues: (result) => result,
      changedBy: session.userId,
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
            scopeToHousehold(groceryItems.householdId, session.householdId),
            isNull(groceryItems.deletedAt)
          )
        )
        .returning()
        .get()
  );

  if (!updated) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
  });

  return c.json(updated);
});

// Update item tags
groceriesRoute.put("/:id/tags", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:tags`,
    ROUTE_RATE_LIMITS.groceries.tags
  );

  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updateTagsSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      scopeToHousehold(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  // Verify all tags belong to this household
  if (validated.tagIds.length > 0) {
    const validTags = await db.query.groceryTags.findMany({
      where: and(
        inArray(groceryTags.id, validated.tagIds),
        scopeToHousehold(groceryTags.householdId, session.householdId)
      ),
    });
    if (validTags.length !== validated.tagIds.length) {
      throw new ActionError("One or more tag IDs are invalid", "VALIDATION_ERROR");
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

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
  });

  return c.json({ success: true });
});

// Update purchase date
groceriesRoute.patch("/:id/purchase-date", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:updateDate`,
    ROUTE_RATE_LIMITS.groceries.updateDate
  );

  const id = c.req.param("id");
  const body = await c.req.json();
  const validated = updatePurchaseDateSchema.parse(body);
  const db = getDb(c.env.DB);

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      scopeToHousehold(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  const updated = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "grocery_items",
      recordId: id,
      operation: "UPDATE",
      oldValues: existing,
      newValues: (result) => result,
      changedBy: session.userId,
    },
    async () =>
      db
        .update(groceryItems)
        .set({
          purchasedAt: validated.purchasedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(groceryItems.id, id),
            scopeToHousehold(groceryItems.householdId, session.householdId)
          )
        )
        .returning()
        .get()
  );

  if (!updated) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
  });

  return c.json(updated);
});

// Soft-delete item
groceriesRoute.delete("/:id", async (c) => {
  const session = c.get("appSession");
  await enforceRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:delete`,
    ROUTE_RATE_LIMITS.groceries.delete
  );

  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      scopeToHousehold(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  const deleted = await withAudit(
    db,
    {
      householdId: session.householdId,
      tableName: "grocery_items",
      recordId: id,
      operation: "DELETE",
      oldValues: existing,
      changedBy: session.userId,
    },
    async () =>
      db
        .update(groceryItems)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(groceryItems.id, id),
            scopeToHousehold(groceryItems.householdId, session.householdId)
          )
        )
        .returning()
        .get()
  );

  if (!deleted) {
    throw new ActionError("Item not found", "NOT_FOUND");
  }

  await broadcastToHousehold(c.env, session.householdId, {
    type: "GROCERY_UPDATE",
    action: "delete",
    entityId: id,
  });

  return c.json(deleted);
});

// Clear old purchased items (90+ days)
groceriesRoute.post("/clear-old", async (c) => {
  const session = c.get("appSession");
  const { allowed } = await checkRateLimit(
    c.env.CACHE,
    `${session.userId}:groceries:clear`,
    ROUTE_RATE_LIMITS.groceries.clear
  );
  if (!allowed) {
    return c.json({ deleted: 0, skipped: true });
  }

  const db = getDb(c.env.DB);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const deletedRows = await db
    .delete(groceryItems)
    .where(
      and(
        scopeToHousehold(groceryItems.householdId, session.householdId),
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
        householdId: session.householdId,
        tableName: "grocery_items",
        recordId: row.id,
        operation: "DELETE",
        oldValues: row,
        changedBy: session.userId,
      }))
    );
  }

  return c.json({ deleted: deletedRows.length });
});
