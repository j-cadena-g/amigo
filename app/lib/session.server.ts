import { redirect } from "react-router";
import { getApp, getCloudflare, type RouterLoadContext } from "../../router-context";
import type { AppSession, Env, SessionStatus } from "../../server/env";

/**
 * Get the app session in a React Router loader.
 * Throws a redirect to "/" if the user is not authenticated.
 */
export function requireSession(context: RouterLoadContext): AppSession {
  const session = getApp(context).session;
  if (!session) {
    throw redirect("/");
  }
  return session;
}

/**
 * Get the session status set by the soft auth middleware.
 * Used by the app layout to determine redirects for org/setup gating.
 */
export function getSessionStatus(context: RouterLoadContext): SessionStatus {
  return getApp(context).sessionStatus ?? "unauthenticated";
}

export function getCspNonce(context: RouterLoadContext): string | undefined {
  return getApp(context).cspNonce;
}

/**
 * Get Cloudflare env bindings from the loader context.
 */
export function getEnv(context: RouterLoadContext): Env {
  return getCloudflare(context).env;
}
