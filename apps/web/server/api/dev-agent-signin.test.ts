import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiHandlerArgs } from "./route";
import { handleDevAgentSignin } from "./dev-agent-signin";

const mocks = vi.hoisted(() => ({
  getUserList: vi.fn(),
  createSignInToken: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { getUserList: mocks.getUserList },
    signInTokens: { createSignInToken: mocks.createSignInToken },
  }),
}));

const DEV_ENV = {
  APP_ENV: "development",
  CLERK_SECRET_KEY: "sk_test_local",
  AGENT_LOGIN_EMAIL: " agent@example.com ",
};

interface CallOptions {
  env?: Partial<typeof DEV_ENV>;
  url?: string;
  method?: string;
  sessionStatus?: ApiHandlerArgs["sessionStatus"];
}

function callSignin({ env, url, method, sessionStatus }: CallOptions = {}) {
  return handleDevAgentSignin({
    request: new Request(url ?? "http://localhost:5190/dev/agent-signin", {
      method: method ?? "GET",
    }),
    params: {},
    env: { ...DEV_ENV, ...env } as ApiHandlerArgs["env"],
    sessionStatus: sessionStatus ?? "unauthenticated",
    loadContext: {} as ApiHandlerArgs["loadContext"],
  });
}

describe("handleDevAgentSignin", () => {
  beforeEach(() => {
    mocks.getUserList.mockReset();
    mocks.createSignInToken.mockReset();
  });

  it.each<[string, CallOptions]>([
    ["outside development", { env: { APP_ENV: "production" } }],
    ["with a live Clerk key", { env: { CLERK_SECRET_KEY: "sk_live_prod" } }],
    ["without an agent email", { env: { AGENT_LOGIN_EMAIL: "  " } }],
    ["on a non-local host", { url: "https://mi-amigo.com/dev/agent-signin" }],
    ["on a LAN address", { url: "http://192.168.1.20:5190/dev/agent-signin" }],
    ["for anything but GET", { method: "POST" }],
  ])("404s %s", async (_case, options) => {
    const response = await callSignin(options);

    expect(response.status).toBe(404);
    expect(mocks.getUserList).not.toHaveBeenCalled();
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
  });

  it("sends an already signed-in browser to the landing page", async () => {
    const response = await callSignin({ sessionStatus: "authenticated" });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
  });

  it("hands a fresh sign-in token to the landing page's sign-in form", async () => {
    mocks.getUserList.mockResolvedValue({ data: [{ id: "user_agent" }] });
    mocks.createSignInToken.mockResolvedValue({ token: "sit.a/b+c=" });

    const response = await callSignin({ url: "http://127.0.0.1:5190/dev/agent-signin" });

    expect(mocks.getUserList).toHaveBeenCalledWith({
      emailAddress: ["agent@example.com"],
      limit: 1,
    });
    expect(mocks.createSignInToken).toHaveBeenCalledWith({
      userId: "user_agent",
      expiresInSeconds: 60,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/?__clerk_ticket=sit.a%2Fb%2Bc%3D");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("says which email is missing when the Clerk user doesn't exist", async () => {
    mocks.getUserList.mockResolvedValue({ data: [] });

    const response = await callSignin();

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("agent@example.com");
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
  });
});
