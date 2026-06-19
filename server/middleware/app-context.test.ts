import { describe, expect, it, vi } from "vitest";
import { appContextMiddleware } from "./app-context";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  resolveSession: vi.fn(),
}));

vi.mock("@clerk/react-router/server", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("../lib/session", () => ({
  resolveSession: mocks.resolveSession,
}));

describe("appContextMiddleware", () => {
  it("resolves pending Clerk sessions instead of treating them as signed out", async () => {
    const args: {
      context: {
        app: {
          cspNonce: string;
          sessionStatus: string;
          session?: unknown;
        };
        cloudflare: {
          env: {
            DB: string;
            CACHE: string;
            CLERK_SECRET_KEY: string;
          };
        };
      };
    } = {
      context: {
        app: {
          cspNonce: "",
          sessionStatus: "unauthenticated",
        },
        cloudflare: {
          env: {
            DB: "db",
            CACHE: "cache",
            CLERK_SECRET_KEY: "secret",
          },
        },
      },
    };
    const next = vi.fn(async () => new Response(null, { status: 204 }));

    mocks.getAuth.mockResolvedValue({
      userId: "clerk-user-1",
      sessionClaims: { email: "agent@example.com", name: "Agent" },
    });
    mocks.resolveSession.mockResolvedValue({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "household-1",
        role: "owner",
        email: "agent@example.com",
        name: "Agent",
      },
    });

    const response = (await appContextMiddleware(
      args as never,
      next
    )) as Response;

    expect(response.status).toBe(204);
    expect(mocks.getAuth).toHaveBeenCalledWith(args, {
      treatPendingAsSignedOut: false,
    });
    expect(args.context.app.sessionStatus).toBe("authenticated");
    expect(args.context.app.session).toEqual(
      expect.objectContaining({ userId: "user-1" })
    );
  });
});
