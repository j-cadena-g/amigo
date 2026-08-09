import { eq, getDb, users } from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMembersRequest } from "./members";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

const mocks = vi.hoisted(() => ({
  updateUserMetadata: vi.fn(),
  createClerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

describe("members integration", () => {
  let householdId: string;
  let ownerId: string;
  let adminOneId: string;
  let adminTwoId: string;
  let memberId: string;
  let memberAuthId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-members-${suffix}`;
    ownerId = `user-members-owner-${suffix}`;
    adminOneId = `user-members-admin-one-${suffix}`;
    adminTwoId = `user-members-admin-two-${suffix}`;
    memberId = `user-members-member-${suffix}`;
    memberAuthId = `clerk_members_member_${suffix}`;

    mocks.updateUserMetadata.mockReset();
    mocks.updateUserMetadata.mockResolvedValue({});
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      users: {
        updateUserMetadata: mocks.updateUserMetadata,
      },
    });

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_members_owner_${suffix}`,
    });
    await db.insert(users).values([
      {
        id: adminOneId,
        authId: `clerk_members_admin_one_${suffix}`,
        email: "admin-one@example.com",
        householdId,
        role: "admin",
      },
      {
        id: adminTwoId,
        authId: `clerk_members_admin_two_${suffix}`,
        email: "admin-two@example.com",
        householdId,
        role: "admin",
      },
      {
        id: memberId,
        authId: memberAuthId,
        email: "member@example.com",
        householdId,
        role: "member",
      },
    ]);
  });

  it("prevents an admin from demoting a peer admin", async () => {
    await expect(
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": `${adminTwoId}/role` },
        request: new Request("http://localhost/api/members/admin/role", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "member" }),
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: adminOneId,
          householdId,
          role: "admin",
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Admins cannot change another admin's role",
    });
  });

  it("claims soft-delete, clears Clerk metadata, then cleans up member data", async () => {
    const response = await handleMembersRequest({
      env: getIntegrationEnv(),
      params: { "*": memberId },
      request: new Request("http://localhost/api/members/member", {
        method: "DELETE",
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: adminOneId,
        householdId,
        role: "admin",
      }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith(memberAuthId, {
      publicMetadata: {
        householdId: null,
        householdName: null,
      },
    });

    const removed = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(removed?.deletedAt).toBeInstanceOf(Date);
  });

  it("sets restoreAllowedUntil to about 14 days when removing a member", async () => {
    const before = Date.now();
    const response = await handleMembersRequest({
      env: getIntegrationEnv(),
      params: { "*": memberId },
      request: new Request("http://localhost/api/members/member", {
        method: "DELETE",
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: adminOneId,
        householdId,
        role: "admin",
      }),
      loadContext: {} as never,
    });
    const after = Date.now();

    expect(response.status).toBe(200);

    const removed = await getDb(getIntegrationEnv().DB)
      .select({
        deletedAt: users.deletedAt,
        restoreAllowedUntil: users.restoreAllowedUntil,
      })
      .from(users)
      .where(eq(users.id, memberId))
      .get();

    expect(removed?.deletedAt).toBeInstanceOf(Date);
    expect(removed?.restoreAllowedUntil).toBeInstanceOf(Date);
    const restoreMs = removed!.restoreAllowedUntil!.getTime();
    const graceMs = 14 * 24 * 60 * 60 * 1000;
    expect(restoreMs).toBeGreaterThanOrEqual(before + graceMs - 1000);
    expect(restoreMs).toBeLessThanOrEqual(after + graceMs + 1000);
  });

  it("lets a member leave with soft-delete, restore grace, and cleared Clerk metadata", async () => {
    const before = Date.now();
    const response = await handleMembersRequest({
      env: getIntegrationEnv(),
      params: { "*": "leave" },
      request: new Request("http://localhost/api/members/leave", {
        method: "POST",
      }),
      sessionStatus: "authenticated",
      session: testSession({
        userId: memberId,
        householdId,
        role: "member",
      }),
      loadContext: {} as never,
    });
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith(memberAuthId, {
      publicMetadata: {
        householdId: null,
        householdName: null,
      },
    });

    const left = await getDb(getIntegrationEnv().DB)
      .select({
        deletedAt: users.deletedAt,
        restoreAllowedUntil: users.restoreAllowedUntil,
      })
      .from(users)
      .where(eq(users.id, memberId))
      .get();

    expect(left?.deletedAt).toBeInstanceOf(Date);
    expect(left?.restoreAllowedUntil).toBeInstanceOf(Date);
    const restoreMs = left!.restoreAllowedUntil!.getTime();
    const graceMs = 14 * 24 * 60 * 60 * 1000;
    expect(restoreMs).toBeGreaterThanOrEqual(before + graceMs - 1000);
    expect(restoreMs).toBeLessThanOrEqual(after + graceMs + 1000);
  });

  it("denies leave for a sole owner", async () => {
    const suffix = crypto.randomUUID();
    const soleHouseholdId = `hh-sole-${suffix}`;
    const soleOwnerId = `user-sole-owner-${suffix}`;
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId: soleHouseholdId,
      ownerId: soleOwnerId,
      ownerAuthId: `clerk_sole_owner_${suffix}`,
    });

    await expect(
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "leave" },
        request: new Request("http://localhost/api/members/leave", {
          method: "POST",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: soleOwnerId,
          householdId: soleHouseholdId,
          role: "owner",
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("denies leave for an owner even when other members exist", async () => {
    await expect(
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "leave" },
        request: new Request("http://localhost/api/members/leave", {
          method: "POST",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: ownerId,
          householdId,
          role: "owner",
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });

    const owner = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, ownerId))
      .get();
    expect(owner?.deletedAt).toBeNull();
  });

  it("restores D1 membership when leave Clerk metadata clear fails", async () => {
    mocks.updateUserMetadata.mockRejectedValueOnce(
      new Error("Clerk unavailable")
    );

    await expect(
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "leave" },
        request: new Request("http://localhost/api/members/leave", {
          method: "POST",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: memberId,
          householdId,
          role: "member",
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Failed to clear household metadata from Clerk user",
    });

    const left = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(left?.deletedAt).toBeNull();
  });

  it("resolves concurrent leave and ownership transfer without a soft-deleted owner", async () => {
    const raceHouseholdId = crypto.randomUUID();
    const raceOwnerId = crypto.randomUUID();
    const raceAdminId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId: raceHouseholdId,
      ownerId: raceOwnerId,
      ownerAuthId: `clerk_race_owner_${raceOwnerId}`,
    });
    await db.insert(users).values({
      id: raceAdminId,
      authId: `clerk_race_admin_${raceAdminId}`,
      email: "race-admin@example.com",
      householdId: raceHouseholdId,
      role: "admin",
    });

    const results = await Promise.allSettled([
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "leave" },
        request: new Request("http://localhost/api/members/leave", {
          method: "POST",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: raceAdminId,
          householdId: raceHouseholdId,
          role: "admin",
        }),
        loadContext: {} as never,
      }),
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "transfer-ownership" },
        request: new Request("http://localhost/api/members/transfer-ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newOwnerId: raceAdminId }),
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: raceOwnerId,
          householdId: raceHouseholdId,
          role: "owner",
        }),
        loadContext: {} as never,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const rows = await getDb(getIntegrationEnv().DB)
      .select({
        id: users.id,
        role: users.role,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.householdId, raceHouseholdId));

    const softDeletedOwners = rows.filter(
      (row) => row.role === "owner" && row.deletedAt != null
    );
    expect(softDeletedOwners).toHaveLength(0);

    const activeOwners = rows.filter(
      (row) => row.role === "owner" && row.deletedAt == null
    );
    expect(activeOwners).toHaveLength(1);

    const raceAdmin = rows.find((row) => row.id === raceAdminId);
    expect(raceAdmin).toBeDefined();
    if (raceAdmin?.deletedAt != null) {
      expect(raceAdmin.role).not.toBe("owner");
    }
  });

  it("does not soft-delete the app member when Clerk metadata clearing fails", async () => {
    mocks.updateUserMetadata.mockRejectedValueOnce(
      new Error("Clerk unavailable")
    );

    await expect(
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": memberId },
        request: new Request("http://localhost/api/members/member", {
          method: "DELETE",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: adminOneId,
          householdId,
          role: "admin",
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Failed to clear household metadata from Clerk user",
    });

    const member = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(member?.deletedAt).toBeNull();
  });

  it("resolves concurrent admin removal and ownership transfer without zero owners", async () => {
    const raceHouseholdId = crypto.randomUUID();
    const raceOwnerId = crypto.randomUUID();
    const raceAdminId = crypto.randomUUID();
    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId: raceHouseholdId,
      ownerId: raceOwnerId,
      ownerAuthId: `clerk_remove_race_owner_${raceOwnerId}`,
    });
    await db.insert(users).values({
      id: raceAdminId,
      authId: `clerk_remove_race_admin_${raceAdminId}`,
      email: "remove-race-admin@example.com",
      householdId: raceHouseholdId,
      role: "admin",
    });

    const results = await Promise.allSettled([
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": raceAdminId },
        request: new Request("http://localhost/api/members/admin", {
          method: "DELETE",
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: raceOwnerId,
          householdId: raceHouseholdId,
          role: "owner",
        }),
        loadContext: {} as never,
      }),
      handleMembersRequest({
        env: getIntegrationEnv(),
        params: { "*": "transfer-ownership" },
        request: new Request("http://localhost/api/members/transfer-ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newOwnerId: raceAdminId }),
        }),
        sessionStatus: "authenticated",
        session: testSession({
          userId: raceOwnerId,
          householdId: raceHouseholdId,
          role: "owner",
        }),
        loadContext: {} as never,
      }),
    ]);

    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const rows = await getDb(getIntegrationEnv().DB)
      .select({
        id: users.id,
        role: users.role,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.householdId, raceHouseholdId));

    const activeOwners = rows.filter(
      (row) => row.role === "owner" && row.deletedAt == null
    );
    expect(activeOwners).toHaveLength(1);

    const softDeletedOwners = rows.filter(
      (row) => row.role === "owner" && row.deletedAt != null
    );
    expect(softDeletedOwners).toHaveLength(0);
  });
});
