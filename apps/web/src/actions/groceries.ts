"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, isNull, lt, isNotNull } from "@amigo/db";
import { groceryItems, groceryItemTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";
import { addToBatch } from "@/lib/push/batching";
import { scheduleBatchProcessing } from "@/lib/push/sender";

export async function addItem(
  name: string,
  category?: string,
  tagIds?: string[]
) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const item = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(groceryItems)
      .values({
        householdId: session.householdId,
        createdByUserId: session.userId,
        itemName: name.trim(),
        category: category?.trim() || "Uncategorized",
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert grocery item");
    }

    if (tagIds && tagIds.length > 0) {
      await tx.insert(groceryItemTags).values(
        tagIds.map((tagId) => ({
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
    itemName: name.trim(),
    actorUserId: session.userId,
    actorName: session.name ?? "Someone",
  });
  scheduleBatchProcessing(session.householdId);

  revalidatePath("/groceries");

  return item;
}

export async function toggleItem(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, id),
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new Error("Item not found");
  }

  const [updated] = await db
    .update(groceryItems)
    .set({
      isPurchased: !existing.isPurchased,
      purchasedAt: existing.isPurchased ? null : new Date(),
    })
    .where(
      and(
        eq(groceryItems.id, id),
        eq(groceryItems.householdId, session.householdId)
      )
    )
    .returning();

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
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
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const [deleted] = await db
    .update(groceryItems)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(groceryItems.id, id),
        eq(groceryItems.householdId, session.householdId)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Item not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "delete",
    entityId: id,
  });

  revalidatePath("/groceries");

  return deleted;
}

export async function updateItemTags(itemId: string, tagIds: string[]) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const existing = await db.query.groceryItems.findFirst({
    where: and(
      eq(groceryItems.id, itemId),
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
  });

  if (!existing) {
    throw new Error("Item not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(groceryItemTags)
      .where(eq(groceryItemTags.itemId, itemId));

    if (tagIds.length > 0) {
      await tx.insert(groceryItemTags).values(
        tagIds.map((tagId) => ({
          itemId,
          tagId,
        }))
      );
    }
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: itemId,
  });

  revalidatePath("/groceries");
}

export async function updateItem(id: string, name: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Item name cannot be empty");
  }

  const [updated] = await db
    .update(groceryItems)
    .set({
      itemName: trimmedName,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(groceryItems.id, id),
        eq(groceryItems.householdId, session.householdId),
        isNull(groceryItems.deletedAt)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Item not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "update",
    entityId: id,
  });

  revalidatePath("/groceries");

  return updated;
}

export async function clearOldPurchasedItems() {
  const session = await getSession();
  if (!session) {
    return { deleted: 0 };
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await db
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

  return { deleted: result.length };
}
