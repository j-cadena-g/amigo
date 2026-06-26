import { describe, expect, it } from "vitest";
import { AMIGO_DEV_ORIGIN } from "./dev-origin";
import { requestMatchesAllowedOrigin } from "./request-origin";

describe("requestMatchesAllowedOrigin", () => {
  it("accepts an exact origin match", () => {
    const request = new Request("http://localhost/api/setup", {
      method: "POST",
      headers: { Origin: AMIGO_DEV_ORIGIN },
    });

    expect(requestMatchesAllowedOrigin(request, AMIGO_DEV_ORIGIN)).toBe(true);
  });

  it("rejects cross-origin unsafe requests", () => {
    const request = new Request("https://app.example.test/api/setup", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });

    expect(
      requestMatchesAllowedOrigin(request, "https://app.example.test")
    ).toBe(false);
  });

  it("rejects localhost port mismatches", () => {
    const request = new Request("http://localhost/api/setup", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });

    expect(requestMatchesAllowedOrigin(request, AMIGO_DEV_ORIGIN)).toBe(false);
  });
});
