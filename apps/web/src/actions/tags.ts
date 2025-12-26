"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, sql, withAuditing } from "@amigo/db";
import { groceryTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";

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

  // Check for existing tag with same name (case-insensitive) in this household
  const existingTag = await db.query.groceryTags.findFirst({
    where: and(
      eq(groceryTags.householdId, session.householdId),
      sql`lower(${groceryTags.name}) = lower(${trimmedName})`
    ),
  });

  // If tag already exists, return it without creating a duplicate
  if (existingTag) {
    return existingTag;
  }

  // Create new tag
  const tag = await withAuditing(session.authId, async (tx) => {
    const [inserted] = await tx
      .insert(groceryTags)
      .values({
        householdId: session.householdId,
        name: trimmedName,
        color: color?.trim() || "blue",
      })
      .returning();
    return inserted;
  });

  revalidatePath("/groceries");

  return tag;
}

export async function deleteTag(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const deleted = await withAuditing(session.authId, async (tx) => {
    const [result] = await tx
      .delete(groceryTags)
      .where(eq(groceryTags.id, id))
      .returning();
    return result;
  });

  if (!deleted) {
    throw new Error("Tag not found");
  }

  revalidatePath("/groceries");

  return deleted;
}
