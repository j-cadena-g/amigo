import { redirect } from "react-router";
import type { AppSession, Env, SessionStatus } from "../../server/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAppContext(context: any) {
  const app = context?.app;
  if (app) return app;
  throw new Error("Missing app router context");
}

/**
 * Get the app session in a React Router loader.
 * Throws a redirect to "/" if the user is not authenticated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireSession(context: any): AppSession {
  const app = getAppContext(context);
  const session = app.session;
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
  return getAppContext(context).sessionStatus ?? "unauthenticated";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCspNonce(context: any): string | undefined {
  return getAppContext(context).cspNonce;
}

/**
 * Get Cloudflare env bindings from the loader context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEnv(context: any): Env {
  if (context?.cloudflare?.env) return context.cloudflare.env;
  throw new Error("Missing Cloudflare env in router context");
}
