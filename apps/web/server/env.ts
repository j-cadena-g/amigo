import type { SendEmailBinding } from "./lib/email";

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type { SendEmailBinding };

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  RATE_LIMIT_MUTATION: RateLimiterBinding;
  RATE_LIMIT_BULK: RateLimiterBinding;
  RATE_LIMIT_SENSITIVE: RateLimiterBinding;
  RATE_LIMIT_READ: RateLimiterBinding;
  HOUSEHOLD: DurableObjectNamespace;
  ASSETS: Fetcher;
  EMAIL: SendEmailBinding;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  APP_ORIGIN: string;
  APP_ENV: string;
  /** mailto: or https: URI for Web Push VAPID */
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
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
export type SessionStatus =
  | "authenticated"
  | "needs_setup"
  | "revoked"
  | "unauthenticated";
