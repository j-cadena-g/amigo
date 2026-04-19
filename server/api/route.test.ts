import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ActionError } from "../lib/errors";
import { handleApiRoute } from "./route";

function makeRouteArgs(
  request = new Request("http://localhost/api/test")
): LoaderFunctionArgs {
  return {
    request,
    params: {},
    context: {
      cloudflare: { env: {} },
      app: { sessionStatus: "authenticated", session: undefined },
    },
  } as unknown as LoaderFunctionArgs;
}

describe("handleApiRoute", () => {
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
      details: expect.any(Array),
    });
    expect(body.details).toHaveLength(1);
  });
});
