"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, isNull, lt, isNotNull, withAuditContext } from "@amigo/db";
import { groceryItems, groceryItemTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";
import { addToBatch } from "@/lib/push/batching";
import { scheduleBatchProcessing } from "@/lib/push/sender";
import { enforceRateLimit, checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { notFoundError, unauthorizedError, logServerError } from "@/lib/errors";
import { z } from "zod";
import { DEFAULT_GROCERY_CATEGORY } from "@amigo/types";

// Validation schemas
const addItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(255, "Item name too long"),
  category: z.string().max(100, "Category too long").optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

const updateItemSchema = z.object({
  id: z.string().uuid("Invalid item ID"),
  name: z.string().min(1, "Item name is required").max(255, "Item name too long"),
});

const itemIdSchema = z.string().uuid("Invalid item ID");

const updateTagsSchema = z.object({
  itemId: z.string().uuid("Invalid item ID"),
  tagIds: z.array(z.string().uuid("Invalid tag ID")),
});

const updatePurchaseDateSchema = z.object({
  id: z.string().uuid("Invalid item ID"),
  purchasedAt: z.coerce.date().refine(
    (date) => date <= new Date(),
    "Purchase date cannot be in the future"
  ),
});

export async function addItem(
  name: string,
  category?: string,
  tagIds?: string[]
) {
  await enforceRateLimit("action:groceries:add", RATE_LIMITS.MUTATION);

  const validated = addItemSchema.parse({ name, category, tagIds });

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const item = await withAuditContext(session.authId, async (tx) => {
    const [inserted] = await tx
      .insert(groceryItems)
      .values({
        householdId: session.householdId,
        createdByUserId: session.userId,
        itemName: validated.name.trim(),
        category: validated.category?.trim() || DEFAULT_GROCERY_CATEGORY,
      })
      .returning();

    if (!inserted) {
      logServerError("addItem", new Error("Insert returned empty result"), { householdId: session.householdId });
      throw notFoundError("Item");
    }

    if (validated.tagIds && validated.tagIds.length > 0) {
      await tx.insert(groceryItemTags).values(
        validated.tagIds.map((tagId) => ({
          itemId: inserted.id,
          tagId,
        }))
      );
    }

    return inserted;
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "create",
    entityId: item.id,
  });

  // Queue push notification for batching
  addToBatch(session.householdId, {
    type: "add",
    itemName: validated.name.trim(),
    actorUserId: session.userId,
    actorName: session.name ?? "Someone",
  });
  scheduleBatchProcessing(session.householdId);

  revalidatePath("/groceries");

  return item;
}

export async function toggleItem(id: string, purchasedAt?: Date) {
  await enforceRateLimit("action:groceries:toggle", RATE_LIMITS.MUTATION);

  const validatedId = itemIdSchema.parse(id);

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, validatedId),
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw notFoundError("Item");
  }

  // When marking as purchased, use provided date or current date
  // When unmarking, clear the purchase date
  const newPurchasedAt = existing.isPurchased ? null : (purchasedAt ?? new Date());

  const [updated] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(groceryItems)
      .set({
        isPurchased: !existing.isPurchased,
        purchasedAt: newPurchasedAt,
      })
      .where(
        and(
          eq(groceryItems.id, validatedId),
          eq(groceryItems.householdId, session.householdId)
        )
      )
      .returning();
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: validatedId,
  });

  // Send push notification only when marking as purchased (not when un-marking)
  if (!existing.isPurchased) {
    addToBatch(session.householdId, {
      type: "purchase",
      itemName: existing.itemName,
      actorUserId: session.userId,
      actorName: session.name ?? "Someone",
    });
    scheduleBatchProcessing(session.householdId);
  }

  revalidatePath("/groceries");

  return updated;
}

export async function deleteItem(id: string) {
  await enforceRateLimit("action:groceries:delete", RATE_LIMITS.MUTATION);

  const validatedId = itemIdSchema.parse(id);

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const [deleted] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(groceryItems)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(groceryItems.id, validatedId),
          eq(groceryItems.householdId, session.householdId)
        )
      )
      .returning();
  });

  if (!deleted) {
    throw notFoundError("Item");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "delete",
    entityId: validatedId,
  });

  revalidatePath("/groceries");

  return deleted;
}

export async function updateItemTags(itemId: string, tagIds: string[]) {
  await enforceRateLimit("action:groceries:tags", RATE_LIMITS.MUTATION);

  const validated = updateTagsSchema.parse({ itemId, tagIds });

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, validated.itemId),
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw notFoundError("Item");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(groceryItemTags)
      .where(eq(groceryItemTags.itemId, validated.itemId));

    if (validated.tagIds.length > 0) {
      await tx.insert(groceryItemTags).values(
        validated.tagIds.map((tagId) => ({
          itemId: validated.itemId,
          tagId,
        }))
      );
    }
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: validated.itemId,
  });

  revalidatePath("/groceries");
}

export async function updatePurchaseDate(id: string, purchasedAt: Date) {
  await enforceRateLimit("action:groceries:updateDate", RATE_LIMITS.MUTATION);

  const validated = updatePurchaseDateSchema.parse({ id, purchasedAt });

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, validated.id),
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw notFoundError("Item");
  }

  const [updated] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(groceryItems)
      .set({
        purchasedAt: validated.purchasedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groceryItems.id, validated.id),
          eq(groceryItems.householdId, session.householdId)
        )
      )
      .returning();
  });

  if (!updated) {
    throw notFoundError("Item");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: validated.id,
  });

  revalidatePath("/groceries");

  return updated;
}

export async function updateItem(id: string, name: string) {
  await enforceRateLimit("action:groceries:update", RATE_LIMITS.MUTATION);

  const validated = updateItemSchema.parse({ id, name });

  const session = await getSession();
  if (!session) {
    throw unauthorizedError();
  }

  const [updated] = await withAuditContext(session.authId, async (tx) => {
    return tx
      .update(groceryItems)
      .set({
        itemName: validated.name.trim(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groceryItems.id, validated.id),
          eq(groceryItems.householdId, session.householdId),
          isNull(groceryItems.deletedAt)
        )
      )
      .returning();
  });

  if (!updated) {
    throw notFoundError("Item");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: validated.id,
  });

  revalidatePath("/groceries");

  return updated;
}

export async function clearOldPurchasedItems() {
  // This runs on every page load, so we check rate limit but don't throw
  // if exceeded - just skip the cleanup silently
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.BULK,
    keyPrefix: "action:groceries:clear",
  });

  if (!rateLimitResult.success) {
    return { deleted: 0, skipped: true };
  }

  const session = await getSession();
  if (!session) {
    return { deleted: 0 };
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await withAuditContext(session.authId, async (tx) => {
    return tx
      .delete(groceryItems)
      .where(
        and(
          eq(groceryItems.householdId, session.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          lt(groceryItems.purchasedAt, ninetyDaysAgo)
        )
      )
      .returning({ id: groceryItems.id });
  });

  return { deleted: result.length };
}
