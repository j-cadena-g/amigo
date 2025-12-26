"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, isNull, withAuditing } from "@amigo/db";
import { groceryItems, groceryItemTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";

export async function addItem(
  name: string,
  category?: string,
  tagIds?: string[]
) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const item = await withAuditing(session.authId, async (tx) => {
    // Insert the grocery item
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

    // Insert tag associations if any tags provided
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
  });

  revalidatePath("/groceries");

  return item;
}

export async function toggleItem(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Fetch current item state (read can be outside transaction)
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

  const updated = await withAuditing(session.authId, async (tx) => {
    const [result] = await tx
      .update(groceryItems)
      .set({
        isPurchased: !existing.isPurchased,
      })
      .where(
        and(
          eq(groceryItems.id, id),
          eq(groceryItems.householdId, session.householdId)
        )
      )
      .returning();
    return result;
  });

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
  });

  revalidatePath("/groceries");

  return updated;
}

export async function deleteItem(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Soft delete with audit logging
  const deleted = await withAuditing(session.authId, async (tx) => {
    const [result] = await tx
      .update(groceryItems)
      .set({
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(groceryItems.id, id),
          eq(groceryItems.householdId, session.householdId)
        )
      )
      .returning();
    return result;
  });

  if (!deleted) {
    throw new Error("Item not found");
  }

  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
  });

  revalidatePath("/groceries");

  return deleted;
}
