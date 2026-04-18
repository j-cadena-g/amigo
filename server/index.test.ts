import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "./env";

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("./middleware/auth", () => ({
  resolveAppSession: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  resolveAppSessionSoft: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("./lib/security", async () => {
  const actual = await vi.importActual<typeof import("./lib/security")>("./lib/security");
  return {
    ...actual,
    createCspNonce: () => "123",
  };
});

vi.mock("./api/health", () => {
  const route = new Hono();
  route.get("/boom", () => {
    throw new Error("boom");
  });
  return { healthRoute: route };
});

vi.mock("./api/groceries", () => ({ groceriesRoute: new Hono() }));
vi.mock("./api/tags", () => ({ tagsRoute: new Hono() }));
vi.mock("./api/transactions", () => ({ transactionsRoute: new Hono() }));
vi.mock("./api/budgets", () => ({ budgetsRoute: new Hono() }));
vi.mock("./api/recurring", () => ({ recurringRoute: new Hono() }));
vi.mock("./api/assets", () => ({ assetsRoute: new Hono() }));
vi.mock("./api/debts", () => ({ debtsRoute: new Hono() }));
vi.mock("./api/members", () => ({ membersRoute: new Hono() }));
vi.mock("./api/settings", () => ({ settingsRoute: new Hono() }));
vi.mock("./api/sync", () => ({ syncRoute: new Hono() }));
vi.mock("./api/calendar", () => ({ calendarRoute: new Hono() }));
vi.mock("./api/restore", () => ({ restoreRoute: new Hono() }));
vi.mock("./api/audit", () => ({ auditRoute: new Hono() }));
vi.mock("./api/setup", () => ({ setupRoute: new Hono() }));

import app from "./index";

describe("app security headers", () => {
  it("applies security headers to error responses", async () => {
    const env = {
      APP_ENV: "production",
    } satisfies Pick<Env, "APP_ENV">;
    const response = await app.request("/api/boom", {}, env);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-security-policy-report-only")).toContain(
      "script-src 'self' 'nonce-123'"
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
  });
});
