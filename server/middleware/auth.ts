import { createMiddleware } from "hono/factory";
import { getAuth } from "@hono/clerk-auth";
import type { HonoEnv } from "../env";
import { resolveSession } from "../lib/session";

/**
 * Middleware that resolves the Clerk auth session into an app-level session.
 * Returns 401/403 for unauthenticated or unauthorized requests (used for /api/* routes).
 */
export const resolveAppSession = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await resolveSession(
    auth.userId,
    c.env.DB,
    c.env.CACHE,
    c.env.CLERK_SECRET_KEY,
    {
      email: auth.sessionClaims?.email as string | undefined,
      name: auth.sessionClaims?.name as string | undefined,
      orgId: auth.orgId ?? undefined,
    }
  );

  if (result.status === "no_org") {
    return c.json({ error: "Organization membership required" }, 403);
  }

  if (result.status === "needs_setup") {
    return c.json({ error: "Household setup required" }, 403);
  }

  if (result.status === "revoked") {
    return c.json({ error: "Account access revoked" }, 403);
  }

  if (result.status !== "authenticated") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("appSession", result.session);
  return next();
});

/**
 * Soft session middleware for SSR routes.
 * Sets appSession if authenticated, but doesn't reject unauthenticated requests.
 * Loaders can check if appSession is set and redirect if needed.
 */
export const resolveAppSessionSoft = createMiddleware<HonoEnv>(
  async (c, next) => {
    try {
      const auth = getAuth(c);
      if (auth?.userId) {
        const result = await resolveSession(
          auth.userId,
          c.env.DB,
          c.env.CACHE,
          c.env.CLERK_SECRET_KEY,
          {
            email: auth.sessionClaims?.email as string | undefined,
            name: auth.sessionClaims?.name as string | undefined,
            orgId: auth.orgId ?? undefined,
          }
        );
        c.set("sessionStatus", result.status);
        if (result.status === "authenticated") {
          c.set("appSession", result.session);
        }
      } else {
        c.set("sessionStatus", "unauthenticated");
      }
    } catch {
      c.set("sessionStatus", "unauthenticated");
    }
    return next();
  }
);
