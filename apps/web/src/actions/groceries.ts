"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, isNull } from "@amigo/db";
import { groceryItems } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";

export async function addItem(name: string, category?: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const [item] = await db
    .insert(groceryItems)
    .values({
      householdId: session.householdId,
      createdByUserId: session.userId,
      itemName: name.trim(),
      category: category?.trim() || "Uncategorized",
    })
    .returning();

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

  // Fetch current item state
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
  });

  revalidatePath("/groceries");

  return updated;
}

export async function deleteItem(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Soft delete
  const [deleted] = await db
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
