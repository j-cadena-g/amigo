import { describe, expect, it } from "vitest";
import { buildSecurityHeaders, createCspNonce } from "./security";

describe("security headers", () => {
  it("creates a non-empty CSP nonce", () => {
    expect(createCspNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("builds report-only CSP and transport headers for production", () => {
    const headers = buildSecurityHeaders({
      appEnv: "production",
      cspNonce: "nonce-123",
    });

    expect(headers["Content-Security-Policy-Report-Only"]).toContain(
      "script-src 'self' 'nonce-nonce-123'"
    );
    expect(headers["Content-Security-Policy-Report-Only"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("omits HSTS in development", () => {
    const headers = buildSecurityHeaders({
      appEnv: "development",
      cspNonce: "nonce-123",
    });

    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
