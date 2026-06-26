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
            timezone: "America/Toronto",
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
          timezone: "America/Toronto",
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
    expect(household?.timezone).toBe("America/Toronto");
    expect(owner?.role).toBe("owner");
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith(authId, {
      publicMetadata: {
        householdId: body.householdId,
        householdName: "Allowed Household",
      },
    });
  });

  it("does not persist household data when Clerk metadata update fails", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_metadata_fail_${suffix}`;
    const db = getDb(getIntegrationEnv().DB);

    mocks.updateUserMetadata.mockRejectedValue(new Error("Clerk API error"));

    await expect(
      handleSetupRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            householdName: "Test Household",
            homeCurrency: "CAD",
            timezone: "UTC",
          }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: setupAuth(authId),
      })
    ).rejects.toThrow("Clerk API error");

    const user = await db
      .select()
      .from(users)
      .where(eq(users.authId, authId))
      .get();
    const householdCount = await db.select().from(households).all();

    expect(user).toBeUndefined();
    expect(
      householdCount.some((household) => household.name === "Test Household")
    ).toBe(false);
  });

  it("repairs Clerk metadata when a concurrent setup request loses the auth_id race", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_race_${suffix}`;

    const makeRequest = (householdName: string) =>
      handleSetupRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            householdName,
            homeCurrency: "CAD",
            timezone: "America/Toronto",
          }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: setupAuth(authId),
      });

    const results = await Promise.allSettled([
      makeRequest("Race Household A"),
      makeRequest("Race Household B"),
    ]);

    const successes = results.filter(
      (result): result is PromiseFulfilledResult<Response> =>
        result.status === "fulfilled"
    );
    const failures = results.filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: "You already belong to a household",
      }),
    });

    const db = getDb(getIntegrationEnv().DB);
    const owner = await db
      .select()
      .from(users)
      .where(eq(users.authId, authId))
      .get();

    expect(owner).toBeDefined();
    const household = owner
      ? await db
          .select()
          .from(households)
          .where(eq(households.id, owner.householdId))
          .get()
      : undefined;

    expect(household).toBeDefined();
    expect(mocks.updateUserMetadata).toHaveBeenLastCalledWith(authId, {
      publicMetadata: {
        householdId: household!.id,
        householdName: household!.name,
      },
    });
  });

  it("rejects invalid timezones during setup", async () => {
    const suffix = crypto.randomUUID();
    const authId = `clerk_setup_invalid_tz_${suffix}`;

    await expect(
      handleSetupRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            householdName: "Timezone Test Household",
            homeCurrency: "CAD",
            timezone: "Not/A/Timezone",
          }),
        }),
        sessionStatus: "needs_setup",
        loadContext: {} as never,
        auth: setupAuth(authId),
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid timezone",
    });
  });
});
