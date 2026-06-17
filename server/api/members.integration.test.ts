import { eq, getDb, users } from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMembersRequest } from "./members";
import { createTestDb, seedHouseholdWithOwner } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import type { AppSession } from "../env";

const mocks = vi.hoisted(() => ({
  deleteOrganizationMembership: vi.fn(),
  createClerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

function sessionFor(options: {
  userId: string;
  householdId: string;
  role: AppSession["role"];
  orgId: string;
}): AppSession {
  return {
    userId: options.userId,
    householdId: options.householdId,
    orgId: options.orgId,
    role: options.role,
    email: `${options.userId}@example.com`,
    name: options.userId,
  };
}

describe("members integration", () => {
  let householdId: string;
  let orgId: string;
  let ownerId: string;
  let adminOneId: string;
  let adminTwoId: string;
  let memberId: string;
  let memberAuthId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-members-${suffix}`;
    orgId = `org_members_${suffix}`;
    ownerId = `user-members-owner-${suffix}`;
    adminOneId = `user-members-admin-one-${suffix}`;
    adminTwoId = `user-members-admin-two-${suffix}`;
    memberId = `user-members-member-${suffix}`;
    memberAuthId = `clerk_members_member_${suffix}`;

    mocks.deleteOrganizationMembership.mockReset();
    mocks.deleteOrganizationMembership.mockResolvedValue({});
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      organizations: {
        deleteOrganizationMembership: mocks.deleteOrganizationMembership,
      },
    });

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      clerkOrgId: orgId,
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
        session: sessionFor({
          userId: adminOneId,
          householdId,
          role: "admin",
          orgId,
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Admins cannot change another admin's role",
    });
  });

  it("removes the Clerk organization membership before soft-deleting a member", async () => {
    const response = await handleMembersRequest({
      env: getIntegrationEnv(),
      params: { "*": memberId },
      request: new Request("http://localhost/api/members/member", {
        method: "DELETE",
      }),
      sessionStatus: "authenticated",
      session: sessionFor({
        userId: adminOneId,
        householdId,
        role: "admin",
        orgId,
      }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: orgId,
      userId: memberAuthId,
    });

    const removed = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(removed?.deletedAt).toBeInstanceOf(Date);
  });

  it("does not soft-delete the app member when Clerk organization removal fails", async () => {
    mocks.deleteOrganizationMembership.mockRejectedValueOnce(
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
        session: sessionFor({
          userId: adminOneId,
          householdId,
          role: "admin",
          orgId,
        }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Failed to remove member from Clerk organization",
    });

    const member = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(member?.deletedAt).toBeNull();
  });

  it("soft-deletes the app member when Clerk membership was already removed", async () => {
    mocks.deleteOrganizationMembership.mockRejectedValueOnce(
      Object.assign(new Error("Membership not found"), { status: 404 })
    );

    const response = await handleMembersRequest({
      env: getIntegrationEnv(),
      params: { "*": memberId },
      request: new Request("http://localhost/api/members/member", {
        method: "DELETE",
      }),
      sessionStatus: "authenticated",
      session: sessionFor({
        userId: adminOneId,
        householdId,
        role: "admin",
        orgId,
      }),
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const member = await getDb(getIntegrationEnv().DB)
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, memberId))
      .get();
    expect(member?.deletedAt).toBeInstanceOf(Date);
  });
});
