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
        return {
          where: () => ({
            returning: () => ({
              get: async () => ({
                ...mocks.householdState,
                ...set,
              }),
            }),
          }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          all: async () => [],
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
    mocks.householdState.homeCurrency = "CAD";
    mocks.householdState.name = "Original Name";
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
      message: expect.stringMatching(/Missing exchange rate/),
      code: "INTERNAL_ERROR",
    } satisfies Partial<ActionError>);

    expect(mocks.refreshHouseholdHomeCurrencyRates).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "hh-1",
      "EUR"
    );
    expect(mocks.householdUpdate).not.toHaveBeenCalled();
    expect(mocks.householdState.homeCurrency).toBe("CAD");
  });

  it("updates household fields only after FX refresh succeeds", async () => {
    mocks.refreshHouseholdHomeCurrencyRates.mockResolvedValue(undefined);

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
    expect(mocks.refreshHouseholdHomeCurrencyRates).toHaveBeenCalledBefore(
      mocks.householdUpdate as never
    );
    expect(mocks.householdUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ homeCurrency: "USD" })
    );
  });
});
