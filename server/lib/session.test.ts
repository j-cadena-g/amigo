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
}));

import { resolveSession } from "./session";

function createFakeDb(selectResults: unknown[], insertResult?: unknown) {
  const getMock = vi.fn();
  for (const result of selectResults) {
    getMock.mockResolvedValueOnce(result);
  }
  const insertGetMock = vi.fn().mockResolvedValue(insertResult);

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
    getMock,
    insertGetMock,
  };
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
});
