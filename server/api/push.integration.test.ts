import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedHouseholdWithOwner, testSession } from "../test/fixtures";
import { getIntegrationEnv } from "../test/integration-env";
import { handlePushRequest } from "./push";

describe("push subscription security", () => {
  let householdId: string;
  let ownerId: string;

  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    householdId = `hh-push-${suffix}`;
    ownerId = `user-push-owner-${suffix}`;

    const db = createTestDb(getIntegrationEnv().DB);
    await seedHouseholdWithOwner(db, {
      householdId,
      clerkOrgId: `org_push_${suffix}`,
      ownerId,
      ownerAuthId: `clerk_push_owner_${suffix}`,
    });
  });

  it.each([
    "http://updates.push.services.mozilla.com/wpush/v2/test",
    "https://127.0.0.1:8787/push",
    "https://[::1]/push",
    "https://localhost/push",
    "https://user:pass@updates.push.services.mozilla.com/wpush/v2/test",
  ])("rejects unsafe push endpoint %s", async (endpoint) => {
    await expect(
      handlePushRequest({
        env: getIntegrationEnv(),
        params: {},
        request: new Request("http://localhost/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint,
            keys: {
              p256dh: "test-p256dh",
              auth: "test-auth",
            },
          }),
        }),
        sessionStatus: "authenticated",
        session: testSession({ userId: ownerId, householdId }),
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Unsafe push subscription endpoint",
    });
  });
});
