type ClerkAuthLike = unknown;

export interface ClerkIdentity {
  userId: string;
  orgId?: string;
  email?: string;
  name?: string;
}

function getStringClaim(
  claims: unknown,
  key: "email" | "name"
): string | undefined {
  if (!claims || typeof claims !== "object") {
    return undefined;
  }

  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getClerkIdentity(auth: ClerkAuthLike): ClerkIdentity | null {
  if (!auth || typeof auth !== "object") {
    return null;
  }

  const { userId, orgId, sessionClaims } = auth as Record<string, unknown>;

  if (typeof userId !== "string" || userId.length === 0) {
    return null;
  }

  return {
    userId,
    orgId:
      typeof orgId === "string" && orgId.length > 0
        ? orgId
        : undefined,
    email: getStringClaim(sessionClaims, "email"),
    name: getStringClaim(sessionClaims, "name"),
  };
}
