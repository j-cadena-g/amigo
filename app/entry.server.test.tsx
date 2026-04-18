import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – must be hoisted before any imports that reference these modules
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  renderToReadableStream: vi.fn(),
  isbot: vi.fn(),
}));

vi.mock("react-dom/server", () => ({
  renderToReadableStream: mocks.renderToReadableStream,
}));

vi.mock("isbot", () => ({
  isbot: mocks.isbot,
}));

// ServerRouter is JSX – provide a no-op component so JSX transpilation works
vi.mock("react-router", () => ({
  ServerRouter: () => null,
}));

import handleRequest from "./entry.server";
import type { AppLoadContext, EntryContext } from "react-router";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(opts?: { allReady?: Promise<void> }) {
  return {
    allReady: opts?.allReady ?? Promise.resolve(),
  } as unknown as ReadableStream;
}

function makeLoadContext(
  cspNonce?: string,
  missingHono?: boolean
): AppLoadContext {
  if (missingHono) {
    return {} as unknown as AppLoadContext;
  }
  return {
    hono: {
      context: {
        get: vi.fn((key: string) => (key === "cspNonce" ? cspNonce : undefined)),
      },
    },
  } as unknown as AppLoadContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleRequest (entry.server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: renderToReadableStream resolves to a fake stream
    mocks.renderToReadableStream.mockResolvedValue(makeStream());
    // Default: not a bot
    mocks.isbot.mockReturnValue(false);
  });

  it("passes the nonce from hono context to renderToReadableStream", async () => {
    const ctx = makeLoadContext("test-nonce-abc");
    await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(mocks.renderToReadableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nonce: "test-nonce-abc" })
    );
  });

  it("passes undefined nonce when hono context has no cspNonce", async () => {
    const ctx = makeLoadContext(undefined);
    await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(mocks.renderToReadableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nonce: undefined })
    );
  });

  it("passes undefined nonce when hono is absent from loadContext", async () => {
    const ctx = makeLoadContext(undefined, /* missingHono */ true);
    await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(mocks.renderToReadableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nonce: undefined })
    );
  });

  it("returns a response with Content-Type text/html", async () => {
    const ctx = makeLoadContext("nonce-1");
    const response = await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  it("returns a response with the given status code", async () => {
    const ctx = makeLoadContext();
    const response = await handleRequest(
      new Request("http://localhost/"),
      404,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(response.status).toBe(404);
  });

  it("awaits body.allReady for bot user agents", async () => {
    let allReadyResolved = false;
    const allReady = new Promise<void>((resolve) => {
      setTimeout(() => {
        allReadyResolved = true;
        resolve();
      }, 0);
    });
    mocks.renderToReadableStream.mockResolvedValue(makeStream({ allReady }));
    mocks.isbot.mockReturnValue(true);

    const ctx = makeLoadContext("nonce-bot");
    await handleRequest(
      new Request("http://localhost/", {
        headers: { "user-agent": "Googlebot/2.1" },
      }),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(allReadyResolved).toBe(true);
    expect(mocks.isbot).toHaveBeenCalledWith("Googlebot/2.1");
  });

  it("does not await body.allReady for normal browser user agents", async () => {
    let allReadyResolved = false;
    const allReady = new Promise<void>((resolve) => {
      setTimeout(() => {
        allReadyResolved = true;
        resolve();
      }, 10);
    });
    mocks.renderToReadableStream.mockResolvedValue(makeStream({ allReady }));
    mocks.isbot.mockReturnValue(false);

    const ctx = makeLoadContext("nonce-browser");
    await handleRequest(
      new Request("http://localhost/", {
        headers: { "user-agent": "Mozilla/5.0" },
      }),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    // allReady has not yet resolved – the function returned without awaiting it
    expect(allReadyResolved).toBe(false);
  });

  it("treats a missing user-agent as non-bot", async () => {
    mocks.isbot.mockReturnValue(false);
    const ctx = makeLoadContext();

    await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    // isbot is called with an empty string fallback when user-agent is absent
    expect(mocks.isbot).toHaveBeenCalledWith("");
  });

  it("coerces an empty-string nonce to undefined via the || operator", async () => {
    // loadContext.hono.context.get("cspNonce") returns "" -> falsy -> undefined
    const ctx = {
      hono: {
        context: {
          get: vi.fn().mockReturnValue(""),
        },
      },
    } as unknown as AppLoadContext;

    await handleRequest(
      new Request("http://localhost/"),
      200,
      new Headers(),
      {} as EntryContext,
      ctx
    );

    expect(mocks.renderToReadableStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nonce: undefined })
    );
  });
});