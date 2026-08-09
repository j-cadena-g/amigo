import { describe, expect, it } from "vitest";
import {
  buildWebSocketUrl,
  computeReconnectDelay,
  SESSION_INVALIDATED_CLOSE_CODE,
  shouldResumeOnVisibility,
  shouldScheduleBackoffReconnect,
} from "./websocket";

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

describe("computeReconnectDelay", () => {
  it("applies exponential backoff capped at maxDelay", () => {
    expect(computeReconnectDelay(0, 1000, 30000)).toBe(1000);
    expect(computeReconnectDelay(1, 1000, 30000)).toBe(2000);
    expect(computeReconnectDelay(2, 1000, 30000)).toBe(4000);
    expect(computeReconnectDelay(10, 1000, 30000)).toBe(30000);
  });
});

describe("shouldScheduleBackoffReconnect", () => {
  it("never schedules after session invalidation close code", () => {
    expect(
      shouldScheduleBackoffReconnect(SESSION_INVALIDATED_CLOSE_CODE, 0, 10)
    ).toBe(false);
  });

  it("schedules while under the retry budget", () => {
    expect(shouldScheduleBackoffReconnect(1000, 0, 10)).toBe(true);
    expect(shouldScheduleBackoffReconnect(1000, 9, 10)).toBe(true);
  });

  it("stops scheduling once the retry budget is exhausted", () => {
    expect(shouldScheduleBackoffReconnect(1000, 10, 10)).toBe(false);
  });
});

describe("shouldResumeOnVisibility", () => {
  it("resumes only when the tab becomes visible while disconnected", () => {
    expect(shouldResumeOnVisibility("visible", "disconnected")).toBe(true);
    expect(shouldResumeOnVisibility("visible", "connected")).toBe(false);
    expect(shouldResumeOnVisibility("visible", "connecting")).toBe(false);
    expect(shouldResumeOnVisibility("hidden", "disconnected")).toBe(false);
  });
});
