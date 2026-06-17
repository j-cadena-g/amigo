import { and, eq, getDb, transactions, users } from "@amigo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleRestoreRequest } from "./restore";
import {
  clerkAuth,
  createTestDb,
  seedExpenseTransaction,
  seedHouseholdWithOwner,
  seedSoftDeletedMember,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("restore integration", () => {
  let householdId: string;
  let ownerId: string;
  let ownerAuthId: string;
  let deletedUserId: string;
  let deletedAuthId: string;
  let deletedTxnId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-restore-${suffix}`;
    ownerId = `user-restore-owner-${suffix}`;
    ownerAuthId = `clerk_restore_owner_${suffix}`;
    deletedUserId = `user-restore-deleted-${suffix}`;
    deletedAuthId = `clerk_restore_deleted_${suffix}`;
    deletedTxnId = `tx-restore-deleted-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId,
    });
    await seedSoftDeletedMember(db, {
      userId: deletedUserId,
      authId: deletedAuthId,
      householdId,
      restoreAllowedUntil: new Date(Date.now() + 15 * 60 * 1000),
    });
    await seedExpenseTransaction(db, {
      id: deletedTxnId,
      householdId,
      userId: deletedUserId,
      amount: 1500,
      category: "groceries",
      userDisplayName: "Deleted Member",
    });
  });

  it("reports pending restore for soft-deleted clerk identity", async () => {
    const env = getIntegrationEnv();
    const response = await handleRestoreRequest({
      env,
      params: { "*": "pending" },
      request: new Request("http://localhost/api/restore/pending", {
        method: "GET",
      }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
      auth: clerkAuth({ userId: deletedAuthId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      pending: true,
      householdName: "Test Household",
    });
  });

  it("does not report pending restore for an admin-removed member without explicit restore eligibility", async () => {
    const env = getIntegrationEnv();
    const adminRemovedAuthId = `clerk_restore_admin_removed_${crypto.randomUUID()}`;
    await seedSoftDeletedMember(createTestDb(env.DB), {
      userId: `user-restore-admin-removed-${crypto.randomUUID()}`,
      authId: adminRemovedAuthId,
      householdId,
      restoreAllowedUntil: null,
    });

    const response = await handleRestoreRequest({
      env,
      params: { "*": "pending" },
      request: new Request("http://localhost/api/restore/pending", {
        method: "GET",
      }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
      auth: clerkAuth({ userId: adminRemovedAuthId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      pending: false,
    });
  });

  it("restores a soft-deleted user and clears display-name denormalization", async () => {
    const env = getIntegrationEnv();
    const response = await handleRestoreRequest({
      env,
      params: { "*": "restore" },
      request: new Request("http://localhost/api/restore/restore", {
        method: "POST",
      }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
      auth: clerkAuth({
        userId: deletedAuthId,
        email: "restored@example.com",
        name: "Restored User",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    const db = getDb(getIntegrationEnv().DB);
    const restored = await db
      .select()
      .from(users)
      .where(eq(users.id, deletedUserId))
      .get();
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.email).toBe("restored@example.com");
    expect(restored?.name).toBe("Restored User");

    const txn = await db
      .select({ userDisplayName: transactions.userDisplayName })
      .from(transactions)
      .where(eq(transactions.id, deletedTxnId))
      .get();
    expect(txn?.userDisplayName).toBeNull();
  });

  it("fresh-start transfers deleted member data to the household owner", async () => {
    const env = getIntegrationEnv();
    await seedExpenseTransaction(createTestDb(env.DB), {
      id: `tx-fresh-start-${crypto.randomUUID()}`,
      householdId,
      userId: deletedUserId,
      amount: 2200,
      category: "dining",
    });

    const response = await handleRestoreRequest({
      env,
      params: { "*": "fresh-start" },
      request: new Request("http://localhost/api/restore/fresh-start", {
        method: "POST",
      }),
      sessionStatus: "authenticated",
      loadContext: {} as never,
      auth: clerkAuth({
        userId: deletedAuthId,
        email: "fresh@example.com",
        name: "Fresh User",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    const db = getDb(getIntegrationEnv().DB);
    const member = await db
      .select()
      .from(users)
      .where(eq(users.id, deletedUserId))
      .get();
    expect(member?.deletedAt).toBeNull();
    expect(member?.role).toBe("member");

    const transferred = await db
      .select({
        userId: transactions.userId,
        transferredFromUserId: transactions.transferredFromUserId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.transferredFromUserId, deletedUserId)
        )
      );
    expect(transferred.length).toBeGreaterThan(0);
    expect(transferred.every((row) => row.userId === ownerId)).toBe(true);
  });
});
