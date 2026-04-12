import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

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
    clerkOrgId: { name: "clerk_org_id" },
  },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  isNull: (arg: unknown) => ({ type: "isNull", arg }),
}));

import { resolveSession } from "./session";

function createFakeDb(selectResults: unknown[]) {
  const getMock = vi.fn();
  for (const result of selectResults) {
    getMock.mockResolvedValueOnce(result);
  }
  const whereMock = vi.fn(() => ({
    get: getMock,
  }));

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: whereMock,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => ({
          get: vi.fn(),
        })),
      })),
    })),
    whereMock,
  };
}

describe("resolveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes cached sessions from the latest database role", async () => {
    const db = createFakeDb([
      {
        id: "user-1",
        householdId: "house-1",
        role: "member",
        email: "fresh@example.com",
        name: "Fresh User",
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue({
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "owner",
        email: "stale@example.com",
        name: "Stale User",
      }),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      { orgId: "org-1" }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "member",
        email: "fresh@example.com",
        name: "Fresh User",
      },
    });
    expect(kv.put).toHaveBeenCalledWith(
      "session:clerk-user-1:org-1",
      JSON.stringify({
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "member",
        email: "fresh@example.com",
        name: "Fresh User",
      }),
      { expirationTtl: 86400 }
    );
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
  });

  it("still authenticates when KV refresh write fails", async () => {
    const db = createFakeDb([
      {
        id: "user-1",
        householdId: "house-1",
        role: "member",
        email: "fresh@example.com",
        name: "Fresh User",
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const kvError = new Error("KV unavailable");
    const kv = {
      get: vi.fn().mockResolvedValue({
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "owner",
        email: "stale@example.com",
        name: "Stale User",
      }),
      put: vi.fn().mockRejectedValue(kvError),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      { orgId: "org-1" }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "member",
        email: "fresh@example.com",
        name: "Fresh User",
      },
    });
    expect(kv.put).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("Session cache refresh failed", {
      error: kvError,
      cacheKey: "session:clerk-user-1:org-1",
      clerkUserId: "clerk-user-1",
      orgId: "org-1",
    });

    consoleError.mockRestore();
  });

  it("fails closed for soft-deleted users instead of auto-creating them", async () => {
    const db = createFakeDb([
      {
        id: "house-1",
      },
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
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      { orgId: "org-1" }
    );

    expect(result).toEqual({ status: "revoked" });
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("ignores revoked users from other households when resolving a session", async () => {
    const db = createFakeDb([
      {
        id: "house-2",
      },
      {
        id: "user-2",
        householdId: "house-2",
        role: "member",
        email: "active@example.com",
        name: "Active User",
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      { orgId: "org-2" }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-2",
        householdId: "house-2",
        orgId: "org-2",
        role: "member",
        email: "active@example.com",
        name: "Active User",
      },
    });
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
    expect(kv.put).toHaveBeenCalledWith(
      "session:clerk-user-1:org-2",
      JSON.stringify({
        userId: "user-2",
        householdId: "house-2",
        orgId: "org-2",
        role: "member",
        email: "active@example.com",
        name: "Active User",
      }),
      { expirationTtl: 86400 }
    );
    expect(db.whereMock).toHaveBeenNthCalledWith(2, {
      type: "and",
      args: [
        { type: "eq", args: [{ name: "auth_id" }, "clerk-user-1"] },
        { type: "eq", args: [{ name: "household_id" }, "house-2"] },
      ],
    });
    expect(db.whereMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the cold-path household user without a redundant second lookup", async () => {
    const db = createFakeDb([
      {
        id: "house-1",
      },
      {
        id: "user-1",
        householdId: "house-1",
        role: "member",
        email: "user@example.com",
        name: "Existing User",
        deletedAt: null,
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    const result = await resolveSession(
      "clerk-user-1",
      {} as D1Database,
      kv,
      "clerk-secret",
      { orgId: "org-1" }
    );

    expect(result).toEqual({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "house-1",
        orgId: "org-1",
        role: "member",
        email: "user@example.com",
        name: "Existing User",
      },
    });
    expect(db.whereMock).toHaveBeenCalledTimes(2);
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
  });
});
