import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { ActionError } from "../lib/errors";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@amigo/db", () => ({
  getDb: mocks.getDb,
  auditLogs: {
    id: "audit_logs.id",
    operation: "audit_logs.operation",
    changedBy: "audit_logs.changed_by",
    oldValues: "audit_logs.old_values",
    newValues: "audit_logs.new_values",
    createdAt: "audit_logs.created_at",
    householdId: "audit_logs.household_id",
    recordId: "audit_logs.record_id",
    tableName: "audit_logs.table_name",
  },
  users: {
    id: "users.id",
    authId: "users.auth_id",
    name: "users.name",
    email: "users.email",
    householdId: "users.household_id",
  },
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  inArray: (...args: unknown[]) => ({ type: "inArray", args }),
  desc: (value: unknown) => ({ type: "desc", value }),
}));

vi.mock("../middleware/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  ROUTE_RATE_LIMITS: {
    audit: {
      list: { limit: 10, windowMs: 60_000 },
    },
  },
}));

import { auditRoute } from "./audit";

function createLogsQuery(result: unknown[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(async () => result),
  };

  return query;
}

function createUsersQuery(result: unknown[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    all: vi.fn(async () => result),
  };

  return query;
}

function createApp() {
  const app = new Hono<HonoEnv>();
  app.onError((err, c) => {
    if (err instanceof ActionError) {
      const status = {
        UNAUTHORIZED: 401,
        VALIDATION_ERROR: 400,
        RATE_LIMITED: 429,
        PERMISSION_DENIED: 403,
        NOT_FOUND: 404,
      }[err.code] ?? 500;
      return c.json({ error: err.message, code: err.code }, status as 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  });
  app.use("*", async (c, next) => {
    c.set("appSession", {
      userId: "user-1",
      householdId: "house-1",
      orgId: "org-1",
      role: "owner",
      email: "alice@example.com",
      name: "Alice Example",
    });
    await next();
  });
  app.route("/audit", auditRoute);
  return app;
}

describe("auditRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(undefined);
  });

  it("maps audit changedBy user ids to household user names", async () => {
    const usersQuery = createUsersQuery([
      {
        id: "user-1",
        authId: "clerk-user-1",
        name: "Alice Example",
        email: "alice@example.com",
      },
    ]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          createLogsQuery([
            {
              id: "log-1",
              operation: "UPDATE",
              changedBy: "user-1",
              oldValues: { amount: 10 },
              newValues: { amount: 12 },
              createdAt: new Date("2026-04-12T00:00:00.000Z"),
            },
          ])
        )
        .mockReturnValueOnce(usersQuery),
    };
    mocks.getDb.mockReturnValue(db);

    const app = createApp();

    const response = await app.request(
      "/audit/txn-1?table=transactions",
      { method: "GET" },
      { DB: {}, CACHE: {} } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      history: [
        {
          id: "log-1",
          action: "UPDATE",
          userName: "Alice Example",
          timestamp: new Date("2026-04-12T00:00:00.000Z").getTime(),
          changes: {
            amount: {
              from: 10,
              to: 12,
            },
          },
        },
      ],
    });
    expect(usersQuery.where).toHaveBeenCalledWith({
      type: "and",
      args: [
        { type: "eq", args: ["users.household_id", "house-1"] },
        { type: "inArray", args: ["users.id", ["user-1"]] },
      ],
    });
  });

  it("returns an empty history without querying users when there are no audit rows", async () => {
    const db = {
      select: vi.fn().mockReturnValueOnce(createLogsQuery([])),
    };
    mocks.getDb.mockReturnValue(db);

    const response = await createApp().request(
      "/audit/txn-1?table=transactions",
      { method: "GET" },
      { DB: {}, CACHE: {} } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ history: [] });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("keeps userName null when the changedBy user is no longer in the household lookup", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          createLogsQuery([
            {
              id: "log-1",
              operation: "DELETE",
              changedBy: "user-404",
              oldValues: { amount: 10 },
              newValues: null,
              createdAt: new Date("2026-04-12T00:00:00.000Z"),
            },
          ])
        )
        .mockReturnValueOnce(createUsersQuery([])),
    };
    mocks.getDb.mockReturnValue(db);

    const response = await createApp().request(
      "/audit/txn-1?table=transactions",
      { method: "GET" },
      { DB: {}, CACHE: {} } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      history: [
        {
          id: "log-1",
          action: "DELETE",
          userName: null,
          timestamp: new Date("2026-04-12T00:00:00.000Z").getTime(),
          changes: null,
        },
      ],
    });
  });

  it("returns a validation error when the table query param is missing", async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn(),
    });

    const response = await createApp().request(
      "/audit/txn-1",
      { method: "GET" },
      { DB: {}, CACHE: {} } as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "table query param required",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns a rate-limit error when audit reads exceed the route limit", async () => {
    mocks.enforceRateLimit.mockRejectedValueOnce(
      new ActionError("Too many requests", "RATE_LIMITED")
    );
    mocks.getDb.mockReturnValue({
      select: vi.fn(),
    });

    const response = await createApp().request(
      "/audit/txn-1?table=transactions",
      { method: "GET" },
      { DB: {}, CACHE: {} } as never
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
    });
  });
});
