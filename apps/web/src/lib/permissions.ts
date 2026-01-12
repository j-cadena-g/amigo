import type { Session } from "./session";
import type { UserRole } from "@amigo/db";

// Role hierarchy: owner > admin > member
const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * Check if user has at least the required role level
 */
export function hasRole(session: Session | null, minRole: UserRole): boolean {
  if (!session) return false;
  return ROLE_HIERARCHY[session.role] >= ROLE_HIERARCHY[minRole];
}

/**
 * Check if user can manage household settings (owner/admin)
 */
export function canManageHousehold(session: Session | null): boolean {
  return hasRole(session, "admin");
}

/**
 * Check if user can manage shared budgets (owner/admin)
 */
export function canManageSharedBudgets(session: Session | null): boolean {
  return hasRole(session, "admin");
}

/**
 * Check if user can manage members (invite/remove) (owner/admin)
 */
export function canManageMembers(session: Session | null): boolean {
  return hasRole(session, "admin");
}

/**
 * Check if user can transfer ownership (owner only)
 */
export function canTransferOwnership(session: Session | null): boolean {
  return session?.role === "owner";
}

/**
 * Check if user can change another user's role
 */
export function canChangeRole(
  session: Session | null,
  targetRole: UserRole,
  targetUserId: string
): boolean {
  if (!session) return false;

  // Cannot change your own role
  if (session.userId === targetUserId) return false;

  // Only owner can promote to admin
  if (targetRole === "admin") return session.role === "owner";

  // Owner/admin can demote to member
  if (targetRole === "member") return hasRole(session, "admin");

  // Only owner can transfer ownership (via separate action)
  if (targetRole === "owner") return false;

  return false;
}

/**
 * Assert permission, throws if not authorized
 */
export function assertPermission(
  session: Session | null,
  check: (s: Session | null) => boolean,
  message = "Unauthorized"
): asserts session is Session {
  if (!session) {
    throw new Error("Not authenticated");
  }
  if (!check(session)) {
    throw new Error(message);
  }
}
