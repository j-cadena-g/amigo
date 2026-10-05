import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createClerkClient: vi.fn(),
  resolveSession: vi.fn(),
  requestHandler: vi.fn(),
  processRecurringReminders: vi.fn(),
  processDueRecurringRules: vi.fn(),
  processTransactionReminders: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  createRequestHandler: () => mocks.requestHandler,
}));

vi.mock("cloudflare:workers", () => ({
  DurableObject: class DurableObject {},
}));

vi.mock("./server/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./server/lib/session")>()),
  resolveSession: mocks.resolveSession,
}));

vi.mock("./server/lib/recurring-reminders", () => ({
  processRecurringReminders: mocks.processRecurringReminders,
  pruneRecurringReminderDeliveries: vi.fn(),
}));
vi.mock("./server/lib/recurring-processor", () => ({
  processDueRecurringRules: mocks.processDueRecurringRules,
}));
vi.mock("./server/lib/transaction-reminders", () => ({
  processTransactionReminders: mocks.processTransactionReminders,
  pruneTransactionReminderDeliveries: vi.fn(),
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
        role: "member",
        email: "user@example.com",
        name: null,
      },
    });
    mocks.authenticateRequest.mockResolvedValue({
      toAuth: () => ({
        userId: "clerk-user-1",
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
      code: "PERMISSION_DENIED",
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
    expect(mocks.authenticateRequest).toHaveBeenCalledWith(expect.any(Request), {
      acceptsToken: "any",
      treatPendingAsSignedOut: false,
      authorizedParties: ["https://app.example.test"],
    });
  });
});

describe("worker recurring cron routing", () => {
  beforeEach(() => {
    mocks.processRecurringReminders.mockReset().mockResolvedValue({ sent: 1, failed: 0 });
    mocks.processDueRecurringRules.mockReset().mockResolvedValue({ processed: 1, failed: 0 });
    mocks.processTransactionReminders.mockReset().mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("does not run the retired quarter-hour digest trigger", async () => {
    const env = makeEnv();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    await worker.scheduled({ cron: "*/15 * * * *" } as ScheduledEvent, env, {} as ExecutionContext);
    expect(mocks.processRecurringReminders).not.toHaveBeenCalled();
    expect(mocks.processTransactionReminders).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps daily postings independent of reminder checks", async () => {
    await worker.scheduled(
      { cron: "23 4 * * *" } as ScheduledEvent,
      makeEnv(),
      {} as ExecutionContext
    );
    expect(mocks.processDueRecurringRules).toHaveBeenCalledOnce();
    expect(mocks.processRecurringReminders).not.toHaveBeenCalled();
    expect(mocks.processTransactionReminders).not.toHaveBeenCalled();
  });

  it("propagates reminder scheduler failures", async () => {
    const error = new Error("D1 unavailable");
    mocks.processRecurringReminders.mockRejectedValueOnce(error);
    await expect(
      worker.scheduled({ cron: "* * * * *" } as ScheduledEvent, makeEnv(), {} as ExecutionContext)
    ).rejects.toThrow(error);
  });

  it("routes the minute trigger to both selected transaction and recurring reminders", async () => {
    const env = makeEnv();
    await worker.scheduled(
      { cron: "* * * * *", scheduledTime: 0 } as ScheduledEvent,
      env,
      {} as ExecutionContext
    );
    expect(mocks.processTransactionReminders).toHaveBeenCalledExactlyOnceWith(env);
    expect(mocks.processRecurringReminders).toHaveBeenCalledExactlyOnceWith(env);
    expect(mocks.processDueRecurringRules).not.toHaveBeenCalled();
  });

  it("propagates transaction scheduler failures", async () => {
    mocks.processTransactionReminders.mockRejectedValueOnce(new Error("D1 unavailable"));
    await expect(
      worker.scheduled({ cron: "* * * * *" } as ScheduledEvent, makeEnv(), {} as ExecutionContext)
    ).rejects.toThrow("D1 unavailable");
    expect(mocks.processRecurringReminders).toHaveBeenCalledOnce();
  });
});
