import { describe, expect, it } from "vitest";
import {
  POST_SIGN_IN_CONTINUE_PATH,
  SIGN_IN_REDIRECT_PROPS,
} from "./post-sign-in";

describe("post-sign-in continue path", () => {
  it("sends a client-only Clerk session through the dashboard, not setup", () => {
    expect(POST_SIGN_IN_CONTINUE_PATH).toBe("/dashboard");
    expect(POST_SIGN_IN_CONTINUE_PATH).not.toBe("/setup");

    expect(SIGN_IN_REDIRECT_PROPS).toEqual({
      forceRedirectUrl: "/dashboard",
      fallbackRedirectUrl: "/dashboard",
      signUpForceRedirectUrl: "/dashboard",
      signUpFallbackRedirectUrl: "/dashboard",
    });
  });
});
