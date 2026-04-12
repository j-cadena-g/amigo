import { Hono } from "hono";
import { logger } from "hono/logger";
import { clerkMiddleware } from "@hono/clerk-auth";
import type { HonoEnv } from "./env";
import { ActionError } from "./lib/errors";
import { resolveAppSession, resolveAppSessionSoft } from "./middleware/auth";
import { buildSecurityHeaders, createCspNonce } from "./lib/security";

// API route groups
import { healthRoute } from "./api/health";
import { groceriesRoute } from "./api/groceries";
import { tagsRoute } from "./api/tags";
import { transactionsRoute } from "./api/transactions";
import { budgetsRoute } from "./api/budgets";
import { recurringRoute } from "./api/recurring";
import { assetsRoute } from "./api/assets";
import { debtsRoute } from "./api/debts";
import { membersRoute } from "./api/members";
import { settingsRoute } from "./api/settings";
import { syncRoute } from "./api/sync";
import { calendarRoute } from "./api/calendar";
import { restoreRoute } from "./api/restore";
import { auditRoute } from "./api/audit";
import { setupRoute } from "./api/setup";

const app = new Hono<HonoEnv>();

// Global error handler — converts ActionError to JSON responses
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

  // Zod validation errors
  if (err.name === "ZodError") {
    return c.json({ error: "Validation error", details: (err as { issues?: unknown }).issues }, 400);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Global middleware
app.use("*", logger());
app.use("*", clerkMiddleware());
app.use("*", async (c, next) => {
  const cspNonce = createCspNonce();
  c.set("cspNonce", cspNonce);

  await next();

  const securityHeaders = buildSecurityHeaders({
    appEnv: c.env.APP_ENV,
    cspNonce,
  });

  for (const [name, value] of Object.entries(securityHeaders)) {
    c.res.headers.set(name, value);
  }
});

// Health check (no auth required)
app.route("/api", healthRoute);

// Setup route (before resolveAppSession — household doesn't exist yet)
app.route("/api/setup", setupRoute);

// Auth-protected API routes
app.use("/api/*", resolveAppSession);
app.route("/api/groceries", groceriesRoute);
app.route("/api/tags", tagsRoute);
app.route("/api/transactions", transactionsRoute);
app.route("/api/budgets", budgetsRoute);
app.route("/api/recurring", recurringRoute);
app.route("/api/assets", assetsRoute);
app.route("/api/debts", debtsRoute);
app.route("/api/members", membersRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/sync", syncRoute);
app.route("/api/calendar", calendarRoute);
app.route("/api/restore", restoreRoute);
app.route("/api/audit", auditRoute);

// WebSocket upgrade route (Durable Object)
app.use("/ws", resolveAppSession);
app.get("/ws", async (c) => {
  const session = c.get("appSession");
  const id = c.env.HOUSEHOLD.idFromName(session.householdId);
  const stub = c.env.HOUSEHOLD.get(id);
  return stub.fetch(
    new Request(`https://do/ws?userId=${session.userId}`, {
      headers: c.req.raw.headers,
    })
  );
});

// Soft session resolution for SSR routes — sets appSession if authenticated
// React Router loaders access this via context.hono.context.get("appSession")
app.use("*", resolveAppSessionSoft);

export default app;
