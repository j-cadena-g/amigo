import { describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentAgentSignin,
  buildSignInTicketUrl,
  createAgentSigninUrl,
} from "./agent-signin.mjs";

describe("assertDevelopmentAgentSignin", () => {
  it("rejects non-development APP_ENV", () => {
    expect(() =>
      assertDevelopmentAgentSignin({
        APP_ENV: "production",
        APP_ORIGIN: "http://localhost:5190",
        CLERK_SECRET_KEY: "sk_test_x",
        AGENT_LOGIN_EMAIL: "agent@example.com",
      })
    ).toThrow(/development/i);
  });

  it("rejects missing AGENT_LOGIN_EMAIL", () => {
    expect(() =>
      assertDevelopmentAgentSignin({
        APP_ENV: "development",
        APP_ORIGIN: "http://localhost:5190",
        CLERK_SECRET_KEY: "sk_test_x",
      })
    ).toThrow(/AGENT_LOGIN_EMAIL/);
  });

  it("returns trimmed values in development", () => {
    expect(
      assertDevelopmentAgentSignin({
        APP_ENV: "development",
        APP_ORIGIN: "http://localhost:5190/",
        CLERK_SECRET_KEY: "sk_test_x",
        AGENT_LOGIN_EMAIL: " Agent@Example.com ",
      })
    ).toEqual({
      email: "Agent@Example.com",
      origin: "http://localhost:5190",
      secretKey: "sk_test_x",
    });
  });
});

describe("buildSignInTicketUrl", () => {
  it("puts the ticket on the hash SignIn route", () => {
    expect(
      buildSignInTicketUrl("http://localhost:5190", "ticket-value")
    ).toBe("http://localhost:5190/#/?__clerk_ticket=ticket-value");
  });
});

describe("createAgentSigninUrl", () => {
  it("prefers an Agent Task URL", async () => {
    const clerk = {
      agentTasks: {
        create: vi.fn().mockResolvedValue({
          url: "https://clerk.example/agent-task",
        }),
      },
      testingTokens: {
        createTestingToken: vi.fn().mockResolvedValue({ token: "tt_1" }),
      },
      users: { getUserList: vi.fn() },
      signInTokens: { createSignInToken: vi.fn() },
    };

    const result = await createAgentSigninUrl({
      clerk,
      email: "agent@example.com",
      origin: "http://localhost:5190",
    });

    expect(result.kind).toBe("agent_task");
    expect(result.url).toContain("https://clerk.example/agent-task");
    expect(result.url).toContain("__clerk_testing_token=tt_1");
    expect(clerk.agentTasks.create).toHaveBeenCalledWith({
      onBehalfOf: { identifier: "agent@example.com" },
      permissions: "*",
      agentName: "amigo-local-agent",
      taskDescription: "Local agentic sign-in",
      redirectUrl: "http://localhost:5190/dashboard",
    });
    expect(clerk.signInTokens.createSignInToken).not.toHaveBeenCalled();
  });

  it("falls back to a hash ticket URL when Agent Tasks are unavailable", async () => {
    const clerk = {
      agentTasks: {
        create: vi.fn().mockRejectedValue(new Error("not enabled")),
      },
      testingTokens: {
        createTestingToken: vi.fn().mockRejectedValue(new Error("skip")),
      },
      users: {
        getUserList: vi.fn().mockResolvedValue({
          data: [{ id: "user_1" }],
        }),
      },
      signInTokens: {
        createSignInToken: vi.fn().mockResolvedValue({ token: "sit_1" }),
      },
    };

    const result = await createAgentSigninUrl({
      clerk,
      email: "agent@example.com",
      origin: "http://localhost:5190",
    });

    expect(result).toEqual({
      kind: "ticket",
      url: "http://localhost:5190/#/?__clerk_ticket=sit_1",
    });
  });
});
