/**
 * Clerk hash SignIn can leave `/` rendered with a client session while the
 * last loader still saw `unauthenticated`. Continue through the dashboard —
 * never `/setup`. The app layout redirects `needs_setup` and `revoked`.
 */
export const POST_SIGN_IN_CONTINUE_PATH = "/dashboard" as const;

export const SIGN_IN_REDIRECT_PROPS = {
  forceRedirectUrl: POST_SIGN_IN_CONTINUE_PATH,
  fallbackRedirectUrl: POST_SIGN_IN_CONTINUE_PATH,
  signUpForceRedirectUrl: POST_SIGN_IN_CONTINUE_PATH,
  signUpFallbackRedirectUrl: POST_SIGN_IN_CONTINUE_PATH,
} as const;
