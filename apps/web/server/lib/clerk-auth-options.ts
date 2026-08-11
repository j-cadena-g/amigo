/**
 * Shared Clerk auth option shapes for Track D API hygiene.
 *
 * - Session middleware: cookie-oriented (no acceptsToken) — pages resolve AppSession.
 * - API `auth: "clerk"` + WebSocket: token-capable with authorizedParties for APP_ORIGIN.
 */

export const clerkSessionAuthOptions = {
  treatPendingAsSignedOut: false,
} as const;

export function clerkTokenAuthOptions(appOrigin: string) {
  return {
    acceptsToken: "any" as const,
    treatPendingAsSignedOut: false as const,
    authorizedParties: [appOrigin],
  };
}
