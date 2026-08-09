import { describe, expect, it } from "vitest";
import {
  claimNonOwnerSoftDelete,
  restoreSoftDeleteClaim,
  type SoftDeleteClaim,
} from "./member-lifecycle";

function createClaimDb(options: {
  onClaim?: (deletedAt: Date) => void;
  currentDeletedAt: { value: Date | null };
}) {
  return {
    update: () => ({
      set: (set: { deletedAt: Date | null }) => ({
        where: () => ({
          returning: () => ({
            get: async () => {
              if (set.deletedAt == null) {
                return undefined;
              }
              options.currentDeletedAt.value = set.deletedAt;
              options.onClaim?.(set.deletedAt);
              return { id: "user-1", deletedAt: set.deletedAt };
            },
          }),
        }),
      }),
    }),
  };
}

describe("soft-delete claim restore", () => {
  it("returns a claim token from a successful soft-delete", async () => {
    const currentDeletedAt = { value: null as Date | null };
    const db = createClaimDb({ currentDeletedAt });

    const claim = await claimNonOwnerSoftDelete(
      db as never,
      "user-1",
      "hh-1"
    );

    expect(claim).toMatchObject({
      userId: "user-1",
      householdId: "hh-1",
    });
    expect(claim?.deletedAt).toBeInstanceOf(Date);
    expect(currentDeletedAt.value).toEqual(claim?.deletedAt);
  });

  it("does not restore when the row no longer matches the claim deletedAt", async () => {
    const claim: SoftDeleteClaim = {
      userId: "user-1",
      householdId: "hh-1",
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const db = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => ({
              // Simulate no row matched the claim predicate.
              get: async () => undefined,
            }),
          }),
        }),
      }),
    };

    await expect(restoreSoftDeleteClaim(db as never, claim)).resolves.toBe(
      false
    );
  });
});
