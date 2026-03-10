export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  HOUSEHOLD: DurableObjectNamespace;
  ASSETS: Fetcher;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  APP_ENV: string;
}

export interface AppSession {
  userId: string;
  householdId: string;
  role: "owner" | "admin" | "member";
  email: string;
  name: string | null;
}

/**
 * Status of session resolution, set by resolveAppSessionSoft middleware.
 * Loaders use this to determine where to redirect.
 */
export type SessionStatus = "authenticated" | "no_org" | "needs_setup" | "unauthenticated";

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    appSession: AppSession;
    sessionStatus: SessionStatus;
  };
};
