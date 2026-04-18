import { and, eq, isNull, scopeToHousehold, users } from "@amigo/db";

interface TransferOwnershipQueryDb {
  query: {
    users: {
      findFirst(args: { where: ReturnType<typeof and> }): Promise<{ authId: string | null } | undefined>;
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
