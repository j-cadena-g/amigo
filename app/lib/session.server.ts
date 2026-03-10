import { redirect } from "react-router";
import type { AppSession, Env, SessionStatus } from "../../server/env";

/**
 * Extract the Hono context from a RouterContextProvider.
 * React Router middleware requires RouterContextProvider, so values
 * must be accessed via .get() rather than plain property access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHonoContext(context: any) {
  const hono = context.get("hono") as {
    context: {
      get(key: "appSession"): AppSession | undefined;
      get(key: "sessionStatus"): SessionStatus | undefined;
      env: Env;
    };
  };
  return hono.context;
}

/**
 * Get the app session from the Hono context in a React Router loader.
 * Throws a redirect to "/" if the user is not authenticated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireSession(context: any): AppSession {
  const hono = getHonoContext(context);
  const session = hono.get("appSession");
  if (!session) {
    throw redirect("/");
  }
  return session;
}

/**
 * Get the session status set by the soft auth middleware.
 * Used by the app layout to determine redirects for org/setup gating.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionStatus(context: any): SessionStatus {
  const hono = getHonoContext(context);
  return hono.get("sessionStatus") ?? "unauthenticated";
}

/**
 * Get Cloudflare env bindings from the loader context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEnv(context: any): Env {
  const hono = getHonoContext(context);
  return hono.env;
}
