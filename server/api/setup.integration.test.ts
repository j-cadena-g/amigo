import { getDb, households, users, eq } from "@amigo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSetupRequest } from "./setup";
import { getIntegrationEnv } from "../test/integration-env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
  createClerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

function setupAuth(userId: string) {
  return {
    userId,
  } as never;
}

describe("setup integration", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.updateUserMetadata.mockReset();
    mocks.getUser.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "owner@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Household",
      lastName: "Owner",
      publicMetadata: {},
    });
    mocks.updateUserMetadata.mockResolvedValue({});
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      users: {
        getUser: mocks.getUser,
        updateUserMetadata: mocks.updateUserMetadata,
      },
    });
  });

  it("rejects setup when the user already belongs to a household", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_existing_${suffix}`;
    const householdId = `hh_setup_existing_${suffix}`;
    const db = getDb(getIntegrationEnv().DB);

    await db.insert(households).values({
      id: householdId,
      name: "Existing Household",
      homeCurrency: "CAD",
    });
    await db.insert(users).values({
      id: `user_setup_existing_${suffix}`,
      authId,
      email: "existing@example.com",
      householdId,
      role: "owner",
    });

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
        auth: setupAuth(authId),
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "You already belong to a household",
    });
  });

  it("creates a household, owner user, and Clerk household metadata", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_new_${suffix}`;
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
      auth: setupAuth(authId),
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

    expect(household?.name).toBe("Allowed Household");
    expect(owner?.role).toBe("owner");
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith(authId, {
      publicMetadata: {
        householdId: body.householdId,
        householdName: "Allowed Household",
      },
    });
  });
});
