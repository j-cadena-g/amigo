import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterLoadContext } from "../../router-context";
import type { AppContextValue } from "../../router-context";
import { ActionError } from "../lib/errors";
import { AMIGO_DEV_ORIGIN } from "../lib/dev-origin";
import { handleApiRoute } from "./route";

const mocks = vi.hoisted(() => ({
  assertSessionStillValid: vi.fn(),
  getAuth: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@clerk/react-router/server", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("../lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/session")>()),
  assertSessionStillValid: mocks.assertSessionStillValid,
}));

vi.mock("@amigo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@amigo/db")>()),
  getDb: mocks.getDb,
}));

function makeRouteArgs(
  request = new Request("http://localhost/api/test"),
  app: AppContextValue = {
    cspNonce: "test-nonce",
    sessionStatus: "authenticated",
    session: undefined,
  },
  env: Record<string, unknown> = {}
): LoaderFunctionArgs {
  return {
    request,
    params: {},
    context: createRouterLoadContext({
      cloudflare: {
        env: env as never,
        ctx: {} as ExecutionContext,
        caches: {} as CacheStorage,
      },
      app,
    }),
  } as unknown as LoaderFunctionArgs;
}

describe("handleApiRoute", () => {
  beforeEach(() => {
    mocks.assertSessionStillValid.mockReset();
    mocks.assertSessionStillValid.mockResolvedValue(undefined);
    mocks.getAuth.mockReset();
    mocks.getAuth.mockResolvedValue({ userId: "clerk-user-1" });
    mocks.getDb.mockReset();
    mocks.getDb.mockReturnValue({ current: "db" });
  });

  it("maps SyntaxError failures to a 400 validation response", async () => {
    const response = await handleApiRoute(
      makeRouteArgs(
        new Request("http://localhost/api/restore/restore", {
          method: "POST",
          body: "{",
        })
      ),
      {
        auth: "none",
        handler: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON",
      code: "VALIDATION_ERROR",
    });
  });

  it.each([
    ["UNAUTHORIZED", 401],
    ["VALIDATION_ERROR", 400],
    ["INTERNAL_ERROR", 500],
    ["RATE_LIMITED", 429],
    ["PERMISSION_DENIED", 403],
    ["NOT_FOUND", 404],
  ] as const)(
    "maps %s ActionErrors to the expected status code",
    async (code, status) => {
      const response = await handleApiRoute(makeRouteArgs(), {
        auth: "none",
        handler: async () => {
          throw new ActionError(`${code} message`, code);
        },
      });

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: `${code} message`,
        code,
      });
    }
  );

  it("maps ZodError failures to a 400 validation response", async () => {
    const response = await handleApiRoute(makeRouteArgs(), {
      auth: "none",
      handler: async () => {
        z.object({ token: z.string() }).parse({ token: 123 });
        return new Response(null, { status: 204 });
      },
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      details: unknown[];
    };
    expect(body).toMatchObject({
      error: "Validation error",
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });
    expect(body.details).toHaveLength(1);
  });

  it("rejects strict unsafe requests from the wrong origin before the handler runs", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await handleApiRoute(
      makeRouteArgs(
        new Request("https://app.example.test/api/test", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        }),
        {
          cspNonce: "test-nonce",
          sessionStatus: "authenticated",
          session: {
            userId: "user-1",
            householdId: "household-1",
            role: "member",
            email: "user@example.com",
            name: null,
          },
        },
        { APP_ORIGIN: "https://app.example.test" }
      ),
      {
        auth: "strict",
        handler,
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request origin",
      code: "PERMISSION_DENIED",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.assertSessionStillValid).not.toHaveBeenCalled();
  });

  it("rejects strict unsafe requests without Origin even when Referer matches", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await handleApiRoute(
      makeRouteArgs(
        new Request("https://app.example.test/api/test", {
          method: "POST",
          headers: { Referer: "https://app.example.test/settings" },
        }),
        {
          cspNonce: "test-nonce",
          sessionStatus: "authenticated",
          session: {
            userId: "user-1",
            householdId: "household-1",
            role: "member",
            email: "user@example.com",
            name: null,
          },
        },
        { APP_ORIGIN: "https://app.example.test" }
      ),
      {
        auth: "strict",
        handler,
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request origin",
      code: "PERMISSION_DENIED",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.assertSessionStillValid).not.toHaveBeenCalled();
  });

  it("revalidates strict sessions before same-origin unsafe handlers run", async () => {
    const session = {
      userId: "user-1",
      householdId: "household-1",
      role: "admin" as const,
      email: "user@example.com",
      name: "User",
    };
    const handler = vi.fn(async () => new Response(null, { status: 204 }));

    const response = await handleApiRoute(
      makeRouteArgs(
        new Request("https://app.example.test/api/test", {
          method: "PATCH",
          headers: { Origin: "https://app.example.test" },
        }),
        { cspNonce: "test-nonce", sessionStatus: "authenticated", session },
        {
          APP_ORIGIN: "https://app.example.test",
          DB: "d1-binding",
        }
      ),
      {
        auth: "strict",
        handler,
      }
    );

    expect(response.status).toBe(204);
    expect(mocks.getDb).toHaveBeenCalledWith("d1-binding");
    expect(mocks.assertSessionStillValid).toHaveBeenCalledWith(
      { current: "db" },
      session
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("accepts bearer tokens for Clerk-authenticated API routes", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const args = makeRouteArgs(
      new Request(`${AMIGO_DEV_ORIGIN}/api/setup`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          Origin: AMIGO_DEV_ORIGIN,
        },
      }),
      undefined,
      { APP_ORIGIN: AMIGO_DEV_ORIGIN }
    );

    const response = await handleApiRoute(args, {
      auth: "clerk",
      handler,
    });

    expect(response.status).toBe(204);
    expect(mocks.getAuth).toHaveBeenCalledWith(args, {
      acceptsToken: "any",
      treatPendingAsSignedOut: false,
      authorizedParties: [AMIGO_DEV_ORIGIN],
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { userId: "clerk-user-1" },
      })
    );
  });

  it("rejects Clerk-authenticated API routes without a user id", async () => {
    mocks.getAuth.mockResolvedValueOnce({ userId: null });

    const response = await handleApiRoute(makeRouteArgs(), {
      auth: "clerk",
      handler: async () => new Response(null, { status: 204 }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });
});
