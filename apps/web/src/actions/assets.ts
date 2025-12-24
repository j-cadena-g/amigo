"use server";

import { revalidatePath } from "next/cache";
import { db, eq, and, isNull, withAuditing } from "@amigo/db";
import { assets } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { z } from "zod";

const assetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["BANK", "INVESTMENT", "CASH", "PROPERTY"]),
  balance: z.number(),
});

export type AssetInput = z.infer<typeof assetSchema>;

/**
 * Get all assets for the current user.
 * PRIVACY: Filters by BOTH householdId AND userId to ensure
 * users cannot see their partner's assets.
 */
export async function getAssets() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const userAssets = await db.query.assets.findMany({
    where: and(
      eq(assets.householdId, session.householdId),
      eq(assets.userId, session.userId),
      isNull(assets.deletedAt)
    ),
    orderBy: (assets, { desc }) => [desc(assets.createdAt)],
  });

  return userAssets;
}

/**
 * Create a new asset for the current user.
 * Uses withAuditing to track who created the asset.
 */
export async function createAsset(input: AssetInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const validated = assetSchema.parse(input);

  const asset = await withAuditing(session.authId, async (tx) => {
    const [inserted] = await tx
      .insert(assets)
      .values({
        householdId: session.householdId,
        userId: session.userId,
        name: validated.name.trim(),
        type: validated.type,
        balance: validated.balance.toFixed(2),
      })
      .returning();
    return inserted;
  });

  revalidatePath("/assets");

  return asset;
}

/**
 * Update an existing asset.
 * PRIVACY: Ensures userId matches to prevent modifying others' assets.
 * Uses withAuditing to track who made the change.
 */
export async function updateAsset(id: string, input: AssetInput) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const validated = assetSchema.parse(input);

  const updated = await withAuditing(session.authId, async (tx) => {
    const [result] = await tx
      .update(assets)
      .set({
        name: validated.name.trim(),
        type: validated.type,
        balance: validated.balance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assets.id, id),
          eq(assets.userId, session.userId)
        )
      )
      .returning();
    return result;
  });

  if (!updated) {
    throw new Error("Asset not found");
  }

  revalidatePath("/assets");

  return updated;
}

/**
 * Soft delete an asset.
 * PRIVACY: Ensures userId matches to prevent deleting others' assets.
 * Uses withAuditing to track who deleted the asset.
 */
export async function deleteAsset(id: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const deleted = await withAuditing(session.authId, async (tx) => {
    const [result] = await tx
      .update(assets)
      .set({
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(assets.id, id),
          eq(assets.userId, session.userId)
        )
      )
      .returning();
    return result;
  });

  if (!deleted) {
    throw new Error("Asset not found");
  }

  revalidatePath("/assets");

  return deleted;
}
