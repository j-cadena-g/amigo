import { beforeEach, describe, expect, it } from "vitest";
import { handleMeRequest } from "./me";
import {
  createTestDb,
  seedHouseholdWithOwner,
  testSession,
} from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";

describe("me integration", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-me-${suffix}`;
    ownerId = `user-me-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      ownerId,
      ownerAuthId: `clerk_me_${suffix}`,
      householdName: "Me Household",
      homeCurrency: "USD",
      timezone: "America/New_York",
    });
  });

  it("returns the caller identity and household settings", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId, role: "owner" });

    const response = await handleMeRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/me"),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      user: { id: ownerId, role: "owner" },
      household: {
        id: householdId,
        name: "Me Household",
        homeCurrency: "USD",
        timezone: "America/New_York",
      },
    });
  });

  it("rejects non-GET methods with 405", async () => {
    const env = getIntegrationEnv();
    const session = testSession({ userId: ownerId, householdId });

    const response = await handleMeRequest({
      env,
      params: {},
      request: new Request("http://localhost/api/me", { method: "POST" }),
      session,
      sessionStatus: "authenticated",
      loadContext: {} as never,
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
