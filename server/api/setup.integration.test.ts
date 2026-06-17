import { getDb, households, users, eq } from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSetupRequest } from "./setup";
import { getIntegrationEnv } from "../test/integration-env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

function setupAuth(options: { userId: string; orgId: string; isOrgAdmin: boolean }) {
  return {
    userId: options.userId,
    orgId: options.orgId,
    has: vi.fn(({ role }: { role: string }) => role === "org:admin" && options.isOrgAdmin),
  } as never;
}

describe("setup integration", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "owner@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Org",
      lastName: "Admin",
    });
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      users: { getUser: mocks.getUser },
    });
  });

  it("rejects initial setup when the Clerk org member is not an org admin", async () => {
    const suffix = crypto.randomUUID();
    await expect(
      handleSetupRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            householdName: "Blocked Household",
            homeCurrency: "CAD",
          }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: setupAuth({
          userId: `clerk_setup_non_admin_${suffix}`,
          orgId: `org_setup_non_admin_${suffix}`,
          isOrgAdmin: false,
        }),
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Only Clerk organization admins can set up a household",
    });

    expect(mocks.createClerkClient).not.toHaveBeenCalled();
  });

  it("allows a Clerk org admin to claim the initial app owner", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_admin_${suffix}`;
    const orgId = `org_setup_admin_${suffix}`;
    const response = await handleSetupRequest({
      env: getIntegrationEnv(),
      params: {},
      request: new Request("http://localhost/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdName: "Allowed Household",
          homeCurrency: "CAD",
        }),
      }),
      sessionStatus: "needs_setup",
      loadContext: {} as never,
      auth: setupAuth({ userId: authId, orgId, isOrgAdmin: true }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { householdId: string };

    const db = getDb(getIntegrationEnv().DB);
    const household = await db
      .select()
      .from(households)
      .where(eq(households.id, body.householdId))
      .get();
    const owner = await db
      .select()
      .from(users)
      .where(eq(users.authId, authId))
      .get();

    expect(household?.clerkOrgId).toBe(orgId);
    expect(owner?.role).toBe("owner");
  });
});
