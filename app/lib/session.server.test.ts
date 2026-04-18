import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`Redirect to ${url}`);
    (err as unknown as { status: number; location: string }).status = 302;
    (err as unknown as { status: number; location: string }).location = url;
    return err;
  }),
}));

vi.mock("react-router", () => ({
  redirect: mocks.redirect,
}));

import {
  getCspNonce,
  getEnv,
  getSessionStatus,
  requireSession,
} from "./session.server";

import type { AppSession, Env, SessionStatus } from "../../server/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHonoContext(overrides?: {
  appSession?: AppSession;
  cspNonce?: string;
  sessionStatus?: SessionStatus;
  env?: Partial<Env>;
}) {
  const store: Record<string, unknown> = {
    appSession: overrides?.appSession,
    cspNonce: overrides?.cspNonce,
    sessionStatus: overrides?.sessionStatus,
  };

  return {
    get: vi.fn((key: string) => store[key]),
    env: (overrides?.env ?? { DB: {}, CACHE: {}, HOUSEHOLD: {}, ASSETS: {} }) as Env,
  };
}

/** Create a fake RouterContextProvider-like object with a .get() method. */
function makeLoadContext(
  honoContextOverrides?: Parameters<typeof makeHonoContext>[0]
) {
  const honoCtx = makeHonoContext(honoContextOverrides);
  const store = new Map<string, unknown>([["hono", { context: honoCtx }]]);
  return {
    get: vi.fn((key: string) => store.get(key)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCspNonce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the nonce stored in the hono context", () => {
    const ctx = makeLoadContext({ cspNonce: "abc123" });
    expect(getCspNonce(ctx)).toBe("abc123");
  });

  it("returns undefined when no nonce is stored", () => {
    const ctx = makeLoadContext();
    expect(getCspNonce(ctx)).toBeUndefined();
  });

  it("calls context.get('hono') to resolve the hono context", () => {
    const ctx = makeLoadContext({ cspNonce: "nonce-xyz" });
    getCspNonce(ctx);
    expect(ctx.get).toHaveBeenCalledWith("hono");
  });
});

describe("getEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the Env from the hono context", () => {
    const fakeEnv = {
      DB: "fake-db",
      CACHE: "fake-kv",
      CLERK_SECRET_KEY: "sk_test_123",
    } as unknown as Env;
    const ctx = makeLoadContext({ env: fakeEnv });
    expect(getEnv(ctx)).toBe(fakeEnv);
  });

  it("does not attempt to read a legacy cloudflare.env path", () => {
    // The PR removed the legacy `context?.cloudflare?.env` fallback.
    // Ensure the function reads exclusively from the hono context.
    const honoEnv = { APP_ENV: "production" } as unknown as Env;
    const store = new Map<string, unknown>([
      ["hono", { context: makeHonoContext({ env: honoEnv }) }],
      // Legacy path that should no longer be consulted:
      ["cloudflare", { env: { APP_ENV: "legacy" } }],
    ]);
    const ctx = { get: vi.fn((k: string) => store.get(k)) };
    const result = getEnv(ctx);
    expect(result).toBe(honoEnv);
    expect(ctx.get).not.toHaveBeenCalledWith("cloudflare");
  });
});

describe("getSessionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session status when present", () => {
    const ctx = makeLoadContext({ sessionStatus: "authenticated" });
    expect(getSessionStatus(ctx)).toBe("authenticated");
  });

  it("returns 'unauthenticated' when sessionStatus is not set", () => {
    const ctx = makeLoadContext();
    expect(getSessionStatus(ctx)).toBe("unauthenticated");
  });

  it("returns 'no_org' status correctly", () => {
    const ctx = makeLoadContext({ sessionStatus: "no_org" });
    expect(getSessionStatus(ctx)).toBe("no_org");
  });

  it("returns 'needs_setup' status correctly", () => {
    const ctx = makeLoadContext({ sessionStatus: "needs_setup" });
    expect(getSessionStatus(ctx)).toBe("needs_setup");
  });

  it("returns 'revoked' status correctly", () => {
    const ctx = makeLoadContext({ sessionStatus: "revoked" });
    expect(getSessionStatus(ctx)).toBe("revoked");
  });
});

describe("requireSession", () => {
  const fakeSession: AppSession = {
    userId: "user-1",
    householdId: "house-1",
    orgId: "org-1",
    role: "owner",
    email: "user@example.com",
    name: "Test User",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when one is present", () => {
    const ctx = makeLoadContext({ appSession: fakeSession });
    expect(requireSession(ctx)).toEqual(fakeSession);
  });

  it("throws a redirect to '/' when no session is set", () => {
    const ctx = makeLoadContext();
    expect(() => requireSession(ctx)).toThrow();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("throws when appSession is explicitly undefined", () => {
    const ctx = makeLoadContext({ appSession: undefined });
    expect(() => requireSession(ctx)).toThrow();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("uses context.get('hono') to resolve the hono context", () => {
    const ctx = makeLoadContext({ appSession: fakeSession });
    requireSession(ctx);
    expect(ctx.get).toHaveBeenCalledWith("hono");
  });
});

describe("getHonoContext (via exported helpers)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when context.get('hono') returns undefined", () => {
    const ctx = { get: vi.fn().mockReturnValue(undefined) };
    // Accessing undefined.context throws a TypeError
    expect(() => getCspNonce(ctx)).toThrow();
  });

  it("throws when context.get('hono') returns an object without .context", () => {
    const ctx = { get: vi.fn().mockReturnValue({}) };
    // Accessing (undefined).get("cspNonce") throws a TypeError
    expect(() => getCspNonce(ctx)).toThrow();
  });
});