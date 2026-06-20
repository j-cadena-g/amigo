import { describe, expect, it } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "./_index";

function makeLoaderArgs(
  sessionStatus: LoaderFunctionArgs["context"]["app"]["sessionStatus"]
): LoaderFunctionArgs {
  return {
    context: {
      app: {
        cspNonce: "test-nonce",
        sessionStatus,
      },
    },
  } as LoaderFunctionArgs;
}

describe("index route loader", () => {
  it.each([
    ["authenticated", "/dashboard"],
    ["needs_setup", "/setup"],
    ["revoked", "/restore-account"],
  ] as const)("redirects %s sessions to %s", async (sessionStatus, location) => {
    try {
      loader(makeLoaderArgs(sessionStatus));
      throw new Error("Expected loader to redirect");
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get("Location")).toBe(location);
    }
  });

  it("does not redirect unauthenticated sessions", () => {
    expect(loader(makeLoaderArgs("unauthenticated"))).toBeNull();
  });
});
