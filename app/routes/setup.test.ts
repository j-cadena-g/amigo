import { describe, expect, it } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "./setup";

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

describe("setup route loader", () => {
  it.each([
    ["unauthenticated", "/"],
    ["authenticated", "/dashboard"],
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

  it("allows needs_setup sessions to access setup", () => {
    expect(loader(makeLoaderArgs("needs_setup"))).toBeNull();
  });
});
