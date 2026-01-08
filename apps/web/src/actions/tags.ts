"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, sql } from "@amigo/db";
import { groceryTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";

export async function getTags() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const tags = await db.query.groceryTags.findMany({
    where: eq(groceryTags.householdId, session.householdId),
    orderBy: (tags, { asc }) => [asc(tags.name)],
  });

  return tags;
}

export async function createTag(name: string, color?: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const trimmedName = name.trim();

  const existingTag = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.householdId, session.householdId),
      sql`lower(${groceryTags.name}) = lower(${trimmedName})`
    ),
  });

  if (existingTag) {
    return existingTag;
  }

  const [tag] = await db
    .insert(groceryTags)
    .values({
      householdId: session.householdId,
      name: trimmedName,
      color: color?.trim() || "blue",
    })
    .returning();

  revalidatePath("/groceries");
  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
  });

  return tag;
}

export async function updateTag(id: string, name: string, color: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const trimmedName = name.trim();

  const existing = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.id, id),
      eq(groceryTags.householdId, session.householdId)
    ),
  });

  if (!existing) {
    throw new Error("Tag not found");
  }

  const duplicate = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.householdId, session.householdId),
      sql`lower(${groceryTags.name}) = lower(${trimmedName})`,
      sql`${groceryTags.id} != ${id}`
    ),
  });

  if (duplicate) {
    throw new Error("A tag with this name already exists");
  }

  const [updated] = await db
    .update(groceryTags)
    .set({
      name: trimmedName,
      color: color.trim() || "blue",
    })
    .where(
      and(eq(groceryTags.id, id), eq(groceryTags.householdId, session.householdId))
    )
    .returning();

  revalidatePath("/groceries");
  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
  });

  return updated;
}

export async function deleteTag(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const [deleted] = await db
    .delete(groceryTags)
    .where(
      and(eq(groceryTags.id, id), eq(groceryTags.householdId, session.householdId))
    )
    .returning();

  if (!deleted) {
    throw new Error("Tag not found");
  }

  revalidatePath("/groceries");
  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
  });

  return deleted;
}
