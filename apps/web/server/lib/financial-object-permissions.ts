import type { AppSession } from "../env";
import { ActionError } from "./errors";
import { assertPermission } from "./permissions";

export function resolveFinancialObjectUserId(options: {
  session: AppSession;
  existingUserId: string | null;
  requestedIsShared: boolean | undefined;
  adminTakeover: boolean | undefined;
  canManageShared: boolean;
  objectName: string;
}): string | null {
  const {
    session,
    existingUserId,
    requestedIsShared,
    adminTakeover,
    canManageShared,
    objectName,
  } = options;
  const isCurrentlyShared = existingUserId === null;
  const wantsShared = requestedIsShared === true;

  if (isCurrentlyShared) {
    assertPermission(canManageShared, `Only owners and admins can modify shared ${objectName}s`);
    return requestedIsShared === false ? session.userId : null;
  }

  if (existingUserId === session.userId) {
    if (wantsShared) {
      assertPermission(canManageShared, `Only owners and admins can modify shared ${objectName}s`);
    }
    if (requestedIsShared === undefined) {
      return existingUserId;
    }
    return wantsShared ? null : session.userId;
  }

  if (wantsShared) {
    if (!adminTakeover) {
      throw new ActionError(
        "Explicit admin takeover is required to share another user's personal financial object",
        "PERMISSION_DENIED"
      );
    }
    assertPermission(canManageShared, `Only owners and admins can modify shared ${objectName}s`);
    return null;
  }

  throw new ActionError(
    `Cannot modify another user's personal ${objectName}`,
    "PERMISSION_DENIED"
  );
}

export function isExplicitAdminTakeover(options: {
  session: AppSession;
  existingUserId: string | null;
  requestedIsShared: boolean | undefined;
  adminTakeover: boolean | undefined;
}): boolean {
  return (
    options.existingUserId !== null &&
    options.existingUserId !== options.session.userId &&
    options.requestedIsShared === true &&
    options.adminTakeover === true
  );
}
