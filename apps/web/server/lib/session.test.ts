import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
  getDb: vi.fn(),
  setClerkHouseholdMetadata: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

vi.mock("./clerk-household-metadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clerk-household-metadata")>();
  return {
    ...actual,
    setClerkHouseholdMetadata: mocks.setClerkHouseholdMetadata,
  };
});

vi.mock("@amigo/db", () => ({
  getDb: mocks.getDb,
  LOCAL_SEED_USER_ID: "user-seed-001",
  LOCAL_SEED_USER_AUTH_ID: "clerk_dev_user",
  LOCAL_SEED_HOUSEHOLD_ID: "hh-seed-001",
  users: {
    id: { name: "id" },
    householdId: { name: "household_id" },
    role: { name: "role" },
    email: { name: "email" },
    name: { name: "name" },
    deletedAt: { name: "deleted_at" },
    authId: { name: "auth_id" },
  },
  households: {
    id: { name: "id" },
    name: { name: "name" },
  },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  isNull: (arg: unknown) => ({ type: "isNull", arg }),
  scopeToHousehold: (column: unknown, householdId: string) => ({
    type: "scopeToHousehold",
    column,
    householdId,
  }),
}));

import { resolveSession } from "./session";

const SEED_USER = {
  id: "user-seed-001",
  householdId: "hh-seed-001",
  role: "owner",
  email: "dev@example.com",
  name: "Dev User",
  deletedAt: null,
  authId: "clerk_dev_user",
};

function createFakeDb(
  selectResults: unknown[],
  insertResult?: unknown,
  updateResult?: unknown
) {
  const getMock = vi.fn();
  for (const result of selectResults) {
    getMock.mockResolvedValueOnce(result);
  }
  const insertGetMock = vi.fn().mockResolvedValue(insertResult);
  const updateGetMock = vi.fn().mockResolvedValue(updateResult);

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: getMock,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => ({
          get: insertGetMock,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => ({
            get: updateGetMock,
          })),
        })),
      })),
    })),
    getMock,
    insertGetMock,
    updateGetMock,
  };
}

function emptyKv() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as KVNamespace;
}

describe("resolveSession", () => {
  const fixedNow = 1_700_000_000_000;
  let getUserMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    mocks.setClerkHouseholdMetadata.mockResolvedValue(undefined);
    getUserMock = vi.fn().mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "user@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Test",
      lastName: "User",
      publicMetadata: {},
    });
    mocks.createClerkClient.mockReturnValue({
      users: {
        getUser: getUserMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unauthenticated when no Clerk user id is provided", async () => {
    const result = await resolveSession(
      null,
      {} as D1Database,
      {} as KVNamespace,
      "clerk-secret"
    );

    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("skips the warm-path D1 round-trip when the KV session was refreshed recently", async () => {
    const db = createFakeDb([]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue({
        userId: "user-1",
        householdId: "house-1",
        role: "owner",
        email: "cached@example.com",
        name: "Cached User",
        refreshedAt: fixedNow - 30_000,
      }),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret"
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        role: "owner",
        email: "cached@example.com",
        name: "Cached User",
      },
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns revoked for soft-deleted users", async () => {
    const db = createFakeDb([
      {
        id: "user-1",
        householdId: "house-1",
        role: "member",
        email: "user@example.com",
        name: "Revoked User",
        deletedAt: new Date("2026-04-11T00:00:00.000Z"),
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret"
    );

    expect(result).toEqual({ status: "revoked" });
  });

  it("returns needs_setup when the user has no household membership or metadata", async () => {
    const db = createFakeDb([null]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret"
    );

    expect(result).toEqual({ status: "needs_setup" });
  });

  it("auto-creates a member when Clerk metadata points at an existing household", async () => {
    getUserMock.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "user@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Test",
      lastName: "User",
      publicMetadata: {
        householdId: "house-1",
        householdName: "Tagged Household",
      },
    });

    const db = createFakeDb(
      [null, { id: "house-1", name: "Tagged Household" }],
      {
        id: "user-1",
        householdId: "house-1",
        role: "member",
        email: "user@example.com",
        name: "Test User",
      }
    );
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret"
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        role: "member",
        email: "user@example.com",
        name: "Test User",
      },
    });
    expect(db.insert).toHaveBeenCalled();
  });

  it("claims the local seed user in development when Clerk email matches AGENT_LOGIN_EMAIL", async () => {
    getUserMock.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "Agent@Example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Agent",
      lastName: "User",
      publicMetadata: {},
    });

    const claimed = {
      id: "user-seed-001",
      householdId: "hh-seed-001",
      role: "owner",
      email: "Agent@Example.com",
      name: "Agent User",
    };
    const db = createFakeDb(
      [null, SEED_USER, { id: "hh-seed-001", name: "Demo Household" }],
      undefined,
      claimed
    );
    mocks.getDb.mockReturnValue(db);

    const kv = emptyKv();
    const result = await resolveSession(
      "clerk-agent-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      undefined,
      { appEnv: "development", agentLoginEmail: " agent@example.com " }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-seed-001",
        householdId: "hh-seed-001",
        role: "owner",
        email: "Agent@Example.com",
        name: "Agent User",
      },
    });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.setClerkHouseholdMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "clerk-agent-1",
      { householdId: "hh-seed-001", householdName: "Demo Household" }
    );
  });

  it("does not claim the seed user in production even when emails match", async () => {
    getUserMock.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "agent@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Agent",
      lastName: "User",
      publicMetadata: {},
    });

    const db = createFakeDb([null]);
    mocks.getDb.mockReturnValue(db);

    const result = await resolveSession(
      "clerk-agent-1",
      {} as D1Database,
      emptyKv(),
      "clerk-secret",
      undefined,
      { appEnv: "production", agentLoginEmail: "agent@example.com" }
    );

    expect(result).toEqual({ status: "needs_setup" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not claim the seed user when AGENT_LOGIN_EMAIL is missing", async () => {
    const db = createFakeDb([null]);
    mocks.getDb.mockReturnValue(db);

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      emptyKv(),
      "clerk-secret",
      undefined,
      { appEnv: "development" }
    );

    expect(result).toEqual({ status: "needs_setup" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not claim the seed user when Clerk email does not match AGENT_LOGIN_EMAIL", async () => {
    const db = createFakeDb([null]);
    mocks.getDb.mockReturnValue(db);

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      emptyKv(),
      "clerk-secret",
      undefined,
      { appEnv: "development", agentLoginEmail: "agent@example.com" }
    );

    expect(result).toEqual({ status: "needs_setup" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not claim the seed user when it has already been claimed", async () => {
    getUserMock.mockResolvedValue({
      emailAddresses: [{ id: "email-1", emailAddress: "agent@example.com" }],
      primaryEmailAddressId: "email-1",
      firstName: "Agent",
      lastName: "User",
      publicMetadata: {},
    });

    const db = createFakeDb([
      null,
      { ...SEED_USER, authId: "someone-else" },
    ]);
    mocks.getDb.mockReturnValue(db);

    const result = await resolveSession(
      "clerk-agent-1",
      {} as D1Database,
      emptyKv(),
      "clerk-secret",
      undefined,
      { appEnv: "development", agentLoginEmail: "agent@example.com" }
    );

    expect(result).toEqual({ status: "needs_setup" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not steal the seed user when the Clerk auth id already has a membership", async () => {
    const db = createFakeDb([
      {
        id: "user-1",
        householdId: "house-1",
        role: "owner",
        email: "agent@example.com",
        name: "Existing",
        deletedAt: null,
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const result = await resolveSession(
      "clerk-agent-1",
      {} as D1Database,
      emptyKv(),
      "clerk-secret",
      undefined,
      { appEnv: "development", agentLoginEmail: "agent@example.com" }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        role: "owner",
        email: "agent@example.com",
        name: "Existing",
      },
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
