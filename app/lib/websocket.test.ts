import { describe, expect, it } from "vitest";
import { buildWebSocketUrl } from "./websocket";

describe("buildWebSocketUrl", () => {
  it("builds a websocket URL without a user identifier by default", () => {
    expect(buildWebSocketUrl("https://mi-amigo.com/groceries")).toBe(
      "wss://mi-amigo.com/ws"
    );
  });

  it("includes the current user identifier when provided", () => {
    expect(
      buildWebSocketUrl("https://mi-amigo.com/groceries", "user_123")
    ).toBe("wss://mi-amigo.com/ws?userId=user_123");
  });
});
