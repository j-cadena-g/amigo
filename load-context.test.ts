import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock react-router's RouterContextProvider
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  class FakeRouterContextProvider {
    private store = new Map<string, unknown>();

    set(key: string, value: unknown) {
      this.store.set(key, value);
    }

    get(key: string) {
      return this.store.get(key);
    }
  }

  return {
    RouterContextProvider: FakeRouterContextProvider,
    RouterContextProviderSpy: vi.fn(),
  };
});

vi.mock("react-router", () => ({
  RouterContextProvider: mocks.RouterContextProvider,
}));

import { getLoadContext } from "./load-context";
import type { Context } from "hono";
import type { HonoEnv } from "./server/env";
import type { PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy, "dispose">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCloudflare(): Cloudflare {
  return {
    env: {
      DB: {} as D1Database,
      CACHE: {} as KVNamespace,
      HOUSEHOLD: {} as DurableObjectNamespace,
      ASSETS: {} as Fetcher,
      CLERK_SECRET_KEY: "sk_test_key",
      CLERK_PUBLISHABLE_KEY: "pk_test_key",
      APP_ENV: "test",
    },
    cf: {} as CfProperties,
    ctx: {} as ExecutionContext,
    caches: {} as CacheStorage,
  } as unknown as Cloudflare;
}

function makeHonoContext(): { context: Context<HonoEnv> } {
  return {
    context: {
      get: vi.fn(),
      set: vi.fn(),
      env: {} as HonoEnv["Bindings"],
    } as unknown as Context<HonoEnv>,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getLoadContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a RouterContextProvider instance", () => {
    const context = {
      cloudflare: makeCloudflare(),
      hono: makeHonoContext(),
    };
    const result = getLoadContext({ request: new Request("http://localhost/"), context });
    expect(result).toBeInstanceOf(mocks.RouterContextProvider);
  });

  it("sets the cloudflare value on the provider", () => {
    const cloudflare = makeCloudflare();
    const context = {
      cloudflare,
      hono: makeHonoContext(),
    };
    const provider = getLoadContext({ request: new Request("http://localhost/"), context });
    expect((provider as unknown as { get(k: string): unknown }).get("cloudflare")).toBe(cloudflare);
  });

  it("sets the hono value on the provider", () => {
    const hono = makeHonoContext();
    const context = {
      cloudflare: makeCloudflare(),
      hono,
    };
    const provider = getLoadContext({ request: new Request("http://localhost/"), context });
    expect((provider as unknown as { get(k: string): unknown }).get("hono")).toBe(hono);
  });

  it("does not expose any extra keys beyond cloudflare and hono", () => {
    const context = {
      cloudflare: makeCloudflare(),
      hono: makeHonoContext(),
    };
    const provider = getLoadContext({
      request: new Request("http://localhost/"),
      context,
    }) as unknown as { get(k: string): unknown };

    // Keys not explicitly set should be absent
    expect(provider.get("foo")).toBeUndefined();
    expect(provider.get("extra")).toBeUndefined();
  });

  it("sets independent values per call (no shared state between invocations)", () => {
    const cloudflare1 = makeCloudflare();
    const cloudflare2 = makeCloudflare();
    const hono1 = makeHonoContext();
    const hono2 = makeHonoContext();

    const p1 = getLoadContext({
      request: new Request("http://localhost/"),
      context: { cloudflare: cloudflare1, hono: hono1 },
    }) as unknown as { get(k: string): unknown };

    const p2 = getLoadContext({
      request: new Request("http://localhost/"),
      context: { cloudflare: cloudflare2, hono: hono2 },
    }) as unknown as { get(k: string): unknown };

    expect(p1.get("cloudflare")).toBe(cloudflare1);
    expect(p2.get("cloudflare")).toBe(cloudflare2);
    expect(p1.get("cloudflare")).not.toBe(p2.get("cloudflare"));

    expect(p1.get("hono")).toBe(hono1);
    expect(p2.get("hono")).toBe(hono2);
  });

  it("propagates the hono context so downstream .get() calls work correctly", () => {
    const honoContextGet = vi.fn().mockReturnValue("test-nonce");
    const hono = {
      context: {
        get: honoContextGet,
      } as unknown as Context<HonoEnv>,
    };
    const context = {
      cloudflare: makeCloudflare(),
      hono,
    };
    const provider = getLoadContext({
      request: new Request("http://localhost/"),
      context,
    }) as unknown as { get(k: string): unknown };

    const storedHono = provider.get("hono") as typeof hono;
    expect(storedHono.context.get("cspNonce" as never)).toBe("test-nonce");
  });
});