import type { createClerkClient } from "@clerk/backend";

export const CLERK_HOUSEHOLD_METADATA = {
  householdId: "householdId",
  householdName: "householdName",
} as const;

export type ClerkHouseholdMetadata = {
  householdId?: string;
  householdName?: string;
};

type ClerkClient = ReturnType<typeof createClerkClient>;

export function parseClerkHouseholdMetadata(
  publicMetadata: unknown
): ClerkHouseholdMetadata {
  if (!publicMetadata || typeof publicMetadata !== "object") {
    return {};
  }

  const record = publicMetadata as Record<string, unknown>;
  const householdId = record[CLERK_HOUSEHOLD_METADATA.householdId];
  const householdName = record[CLERK_HOUSEHOLD_METADATA.householdName];

  return {
    householdId:
      typeof householdId === "string" && householdId.length > 0
        ? householdId
        : undefined,
    householdName:
      typeof householdName === "string" && householdName.length > 0
        ? householdName
        : undefined,
  };
}

export async function setClerkHouseholdMetadata(
  clerk: ClerkClient,
  userId: string,
  metadata: Required<ClerkHouseholdMetadata>
): Promise<void> {
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      [CLERK_HOUSEHOLD_METADATA.householdId]: metadata.householdId,
      [CLERK_HOUSEHOLD_METADATA.householdName]: metadata.householdName,
    },
  });
}

export async function clearClerkHouseholdMetadata(
  clerk: ClerkClient,
  userId: string
): Promise<void> {
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      [CLERK_HOUSEHOLD_METADATA.householdId]: null,
      [CLERK_HOUSEHOLD_METADATA.householdName]: null,
    },
  });
}
