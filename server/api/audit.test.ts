import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { HonoEnv } from "../env";

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

describe("auditRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(undefined);
  });

  it("maps audit changedBy user ids to household user names", async () => {
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
        .mockReturnValueOnce(
          createUsersQuery([
            {
              id: "user-1",
              authId: "clerk-user-1",
              name: "Alice Example",
              email: "alice@example.com",
            },
          ])
        ),
    };
    mocks.getDb.mockReturnValue(db);

    const app = new Hono<HonoEnv>();
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
  });
});
