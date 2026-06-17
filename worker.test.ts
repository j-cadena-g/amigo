import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createClerkClient: vi.fn(),
  resolveSession: vi.fn(),
  requestHandler: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

vi.mock("react-router", () => ({
  createRequestHandler: () => mocks.requestHandler,
}));

vi.mock("cloudflare:workers", () => ({
  DurableObject: class DurableObject {},
}));

vi.mock("./server/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./server/lib/session")>()),
  resolveSession: mocks.resolveSession,
}));

function makeEnv() {
  const doFetch = vi.fn(async () => new Response("ok"));
  return {
    APP_ORIGIN: "https://app.example.test",
    APP_ENV: "test",
    CLERK_SECRET_KEY: "sk_test_dummy",
    CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
    DB: {},
    CACHE: {},
    HOUSEHOLD: {
      idFromName: vi.fn(() => "household-do-id"),
      get: vi.fn(() => ({ fetch: doFetch })),
    },
  } as never;
}

describe("worker WebSocket security", () => {
  beforeEach(() => {
    mocks.authenticateRequest.mockReset();
    mocks.createClerkClient.mockReset();
    mocks.createClerkClient.mockReturnValue({
      authenticateRequest: mocks.authenticateRequest,
    });
    mocks.resolveSession.mockReset();
    mocks.resolveSession.mockResolvedValue({
      status: "authenticated",
      session: {
        userId: "user-1",
        householdId: "household-1",
        orgId: "org-1",
        role: "member",
        email: "user@example.com",
        name: null,
      },
    });
    mocks.authenticateRequest.mockResolvedValue({
      toAuth: () => ({
        userId: "clerk-user-1",
        orgId: "org-1",
        sessionClaims: { email: "user@example.com" },
      }),
    });
  });

  it("rejects cross-origin WebSocket upgrades before Clerk authentication", async () => {
    const response = await worker.fetch(
      new Request("https://app.example.test/ws", {
        headers: { Origin: "https://evil.example" },
      }),
      makeEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request origin",
    });
    expect(mocks.createClerkClient).not.toHaveBeenCalled();
  });

  it("passes APP_ORIGIN as a Clerk authorized party for valid WebSocket upgrades", async () => {
    const response = await worker.fetch(
      new Request("https://app.example.test/ws", {
        headers: { Origin: "https://app.example.test" },
      }),
      makeEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(mocks.authenticateRequest).toHaveBeenCalledWith(
      expect.any(Request),
      {
        acceptsToken: "any",
        authorizedParties: ["https://app.example.test"],
      }
    );
  });
});
