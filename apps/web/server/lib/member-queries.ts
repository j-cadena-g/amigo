import {
  and,
  eq,
  isNull,
  scopeToHousehold,
  users,
  type UserRole,
} from "@amigo/db";

type TransferOwnershipUser = {
  authId: string | null;
  role: UserRole;
};

interface TransferOwnershipQueryDb {
  query: {
    users: {
      findFirst(args: {
        where: ReturnType<typeof and>;
      }): Promise<TransferOwnershipUser | undefined>;
    };
  };
}

export function getTransferOwnershipUsers(
  db: TransferOwnershipQueryDb,
  householdId: string,
  currentUserId: string,
  newOwnerId: string
) {
  return Promise.all([
    db.query.users.findFirst({
      where: and(
        eq(users.id, newOwnerId),
        scopeToHousehold(users.householdId, householdId),
        isNull(users.deletedAt)
      ),
    }),
    db.query.users.findFirst({
      where: and(
        eq(users.id, currentUserId),
        scopeToHousehold(users.householdId, householdId),
        isNull(users.deletedAt)
      ),
    }),
  ]);
}
