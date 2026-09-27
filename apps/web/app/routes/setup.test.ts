import { describe, expect, it } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { createRouterLoadContext } from "../../router-context";
import type { SessionStatus } from "../../server/env";
import { loader } from "./setup";

function makeLoaderArgs(
  sessionStatus: SessionStatus,
  acceptLanguage?: string
): LoaderFunctionArgs {
  return {
    request: new Request("http://localhost/setup", {
      headers: acceptLanguage ? { "Accept-Language": acceptLanguage } : {},
    }),
    context: createRouterLoadContext({
      app: {
        cspNonce: "test-nonce",
        sessionStatus,
      },
      cloudflare: {
        env: {} as never,
        ctx: {} as ExecutionContext,
        caches: {} as CacheStorage,
      },
    }),
  } as unknown as LoaderFunctionArgs;
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
    expect(loader(makeLoaderArgs("needs_setup"))).toEqual({ regionCurrency: null });
  });

  it("suggests a home currency from the browser's region", () => {
    expect(loader(makeLoaderArgs("needs_setup", "en-US,en;q=0.9"))).toEqual({
      regionCurrency: "USD",
    });
    expect(loader(makeLoaderArgs("needs_setup", "es,es-CO;q=0.9"))).toEqual({
      regionCurrency: "COP",
    });
    expect(loader(makeLoaderArgs("needs_setup", "en-GB"))).toEqual({ regionCurrency: "GBP" });
    expect(loader(makeLoaderArgs("needs_setup", "es"))).toEqual({ regionCurrency: null });
  });
});
