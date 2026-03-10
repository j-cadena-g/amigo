import type { AppSession } from "../env";
import { ActionError } from "./errors";

const ROLE_LEVELS = {
  owner: 3,
  admin: 2,
  member: 1,
} as const;

export function hasRole(
  session: AppSession,
  minRole: keyof typeof ROLE_LEVELS
): boolean {
  return ROLE_LEVELS[session.role] >= ROLE_LEVELS[minRole];
}

export function canManageHousehold(session: AppSession): boolean {
  return hasRole(session, "admin");
}

export function canManageMembers(session: AppSession): boolean {
  return hasRole(session, "admin");
}

export function canManageSharedBudgets(session: AppSession): boolean {
  return hasRole(session, "admin");
}

export function canManageSharedItems(session: AppSession): boolean {
  return hasRole(session, "admin");
}

export function canTransferOwnership(session: AppSession): boolean {
  return session.role === "owner";
}

export function canChangeRole(
  session: AppSession,
  targetRole: string,
  targetUserId: string
): boolean {
  if (targetUserId === session.userId) return false;
  if (targetRole === "owner") return false;
  return hasRole(session, "admin");
}

export function assertPermission(check: boolean, message: string): void {
  if (!check) {
    throw new ActionError(message, "PERMISSION_DENIED");
  }
}
