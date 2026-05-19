import { describe, expect, it } from "vitest";
import { getRequestHandlerMode } from "./request-handler-mode";

describe("getRequestHandlerMode", () => {
  it("returns the provided mode when present", () => {
    expect(getRequestHandlerMode("development")).toBe("development");
  });

  it("falls back to production when mode is missing", () => {
    expect(getRequestHandlerMode()).toBe("production");
  });
});
