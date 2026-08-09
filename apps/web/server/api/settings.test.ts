import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionError } from "../lib/errors";
import { handleSettingsRequest } from "./settings";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  assertSessionStillValid: vi.fn(),
  refreshHouseholdHomeCurrencyRates: vi.fn(),
  logServerError: vi.fn(),
  getDb: vi.fn(),
  householdUpdate: vi.fn(),
  setClerkHouseholdMetadata: vi.fn(),
  createClerkClient: vi.fn(),
  getCloudflare: vi.fn(() => ({ ctx: undefined })),
  members: [] as Array<{ authId: string }>,
  householdState: {
    id: "hh-1",
    name: "Original Name",
    homeCurrency: "CAD" as const,
    timezone: "UTC",
  },
}));

vi.mock("../middleware/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  ROUTE_RATE_LIMITS: {
    settings: { get: {}, patch: {} },
  },
}));

vi.mock("../lib/session", () => ({
  assertSessionStillValid: mocks.assertSessionStillValid,
}));

vi.mock("../lib/home-currency-refresh", () => ({
  refreshHouseholdHomeCurrencyRates: mocks.refreshHouseholdHomeCurrencyRates,
}));

vi.mock("../lib/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/errors")>()),
  logServerError: mocks.logServerError,
}));

vi.mock("../lib/clerk-household-metadata", () => ({
  setClerkHouseholdMetadata: mocks.setClerkHouseholdMetadata,
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

vi.mock("../../router-context", () => ({
  getCloudflare: mocks.getCloudflare,
}));

vi.mock("@amigo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@amigo/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

function createMockDb() {
  return {
    query: {
      households: {
        findFirst: vi.fn(async () => ({ ...mocks.householdState })),
      },
    },
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => {
        mocks.householdUpdate(set);
        Object.assign(mocks.householdState, set);
        return {
          where: () => ({
            returning: () => ({
              get: async () => ({ ...mocks.householdState }),
            }),
          }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          all: async () => mocks.members,
        }),
      }),
    })),
  };
}

describe("handleSettingsRequest home currency", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    mocks.assertSessionStillValid.mockReset().mockResolvedValue(undefined);
    mocks.refreshHouseholdHomeCurrencyRates.mockReset();
    mocks.logServerError.mockReset();
    mocks.householdUpdate.mockReset();
    mocks.setClerkHouseholdMetadata.mockReset().mockResolvedValue(undefined);
    mocks.createClerkClient.mockReset().mockReturnValue({});
    mocks.getCloudflare.mockReset().mockReturnValue({ ctx: undefined });
    mocks.members = [];
    mocks.householdState.homeCurrency = "CAD";
    mocks.householdState.name = "Original Name";
    mocks.householdState.timezone = "UTC";
    mocks.getDb.mockReset().mockReturnValue(createMockDb());
  });

  it("does not update household.homeCurrency when FX refresh fails", async () => {
    mocks.refreshHouseholdHomeCurrencyRates.mockRejectedValue(
      new Error("Missing exchange rate from USD to EUR for home currency refresh")
    );

    await expect(
      handleSettingsRequest({
        env: {} as never,
        params: {},
        request: new Request("http://localhost/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeCurrency: "EUR",
            name: "Should Not Apply",
          }),
        }),
        sessionStatus: "authenticated",
        session: {
          userId: "user-1",
          householdId: "hh-1",
          role: "owner",
          email: "owner@example.com",
          name: "Owner",
        },
        loadContext: {} as never,
      })
    ).rejects.toMatchObject({
      message: "Failed to refresh home currency rates",
      code: "INTERNAL_ERROR",
    } satisfies Partial<ActionError>);

    expect(mocks.refreshHouseholdHomeCurrencyRates).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "hh-1",
      "EUR",
      expect.objectContaining({
        buildAdditionalStatements: expect.any(Function),
      })
    );
    expect(mocks.householdUpdate).not.toHaveBeenCalled();
  });

  it("commits household fields via the atomic FX refresh path", async () => {
    mocks.refreshHouseholdHomeCurrencyRates.mockImplementation(
      async (_env, db, _householdId, _currency, options) => {
        options?.buildAdditionalStatements?.(db);
      }
    );

    const response = await handleSettingsRequest({
      env: {} as never,
      params: {},
      request: new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeCurrency: "USD" }),
      }),
      sessionStatus: "authenticated",
      session: {
        userId: "user-1",
        householdId: "hh-1",
        role: "owner",
        email: "owner@example.com",
        name: "Owner",
      },
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    expect(mocks.refreshHouseholdHomeCurrencyRates).toHaveBeenCalled();
    expect(mocks.householdUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ homeCurrency: "USD" })
    );
  });

  it("skips FX refresh when homeCurrency is unchanged", async () => {
    const response = await handleSettingsRequest({
      env: {} as never,
      params: {},
      request: new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeCurrency: "CAD",
          name: "Renamed Only",
        }),
      }),
      sessionStatus: "authenticated",
      session: {
        userId: "user-1",
        householdId: "hh-1",
        role: "owner",
        email: "owner@example.com",
        name: "Owner",
      },
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    expect(mocks.refreshHouseholdHomeCurrencyRates).not.toHaveBeenCalled();
    expect(mocks.householdUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed Only", homeCurrency: "CAD" })
    );
  });

  it("keeps succeeding when one Clerk member sync fails", async () => {
    mocks.members = [{ authId: "auth-ok" }, { authId: "auth-fail" }];
    mocks.setClerkHouseholdMetadata
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("clerk down"));

    const response = await handleSettingsRequest({
      env: { CLERK_SECRET_KEY: "sk_test" } as never,
      params: {},
      request: new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      sessionStatus: "authenticated",
      session: {
        userId: "user-1",
        householdId: "hh-1",
        role: "owner",
        email: "owner@example.com",
        name: "Owner",
      },
      loadContext: {} as never,
    });

    expect(response.status).toBe(200);
    expect(mocks.setClerkHouseholdMetadata).toHaveBeenCalledTimes(2);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      "settings-clerk-household-metadata",
      expect.any(Error),
      expect.objectContaining({ authId: "auth-fail" })
    );
  });
});
