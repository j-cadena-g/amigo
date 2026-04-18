import { describe, expect, it } from "vitest";
import { buildSecurityHeaders, createCspNonce } from "./security";

describe("security headers", () => {
  it("creates a non-empty CSP nonce", () => {
    expect(createCspNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("builds report-only CSP and transport headers for production", () => {
    const headers = buildSecurityHeaders({
      appEnv: "production",
      cspNonce: "ABcd1234==",
    });
    const csp = headers["Content-Security-Policy-Report-Only"];
    if (!csp) {
      throw new Error("Expected CSP header to be defined");
    }
    const scriptSrc = csp
      .split("; ")
      .find((directive) => directive.startsWith("script-src"));
    const connectSrc = csp
      .split("; ")
      .find((directive) => directive.startsWith("connect-src"));

    expect(csp).toContain("script-src 'self' 'nonce-ABcd1234=='");
    expect(scriptSrc).toBe("script-src 'self' 'nonce-ABcd1234=='");
    expect(connectSrc).toBe("connect-src 'self' https: wss:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("omits HSTS in development", () => {
    const headers = buildSecurityHeaders({
      appEnv: "development",
      cspNonce: "ABcd1234==",
    });

    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
