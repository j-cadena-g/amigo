"use server";

import { db, eq } from "@amigo/db";
import { households } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { canManageHousehold } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateHouseholdNameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

export async function updateHouseholdName(input: { name: string }) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!canManageHousehold(session)) {
    return { success: false, error: "Only owners and admins can update household settings" };
  }

  const parsed = updateHouseholdNameSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await db
      .update(households)
      .set({ name: parsed.data.name })
      .where(eq(households.id, session.householdId));

    revalidatePath("/settings");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Failed to update household name:", error);
    return { success: false, error: "Failed to update household name" };
  }
}
