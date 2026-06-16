import { describe, expect, it, vi } from "vitest";
import { buildSecurityHeaders, createCspNonce } from "./security";

describe("security headers", () => {
  it("creates a non-empty CSP nonce", () => {
    expect(createCspNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("builds enforcing CSP with Clerk origins for production", () => {
    const headers = buildSecurityHeaders({
      appEnv: "production",
      cspNonce: "ABcd1234==",
      clerkPublishableKey: "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk",
    });
    const csp = headers["Content-Security-Policy"];
    if (!csp) {
      throw new Error("Expected enforcing CSP header in production");
    }

    expect(headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
    expect(csp).toContain("script-src 'self' 'nonce-ABcd1234=='");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("https://clerk.example.dev");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("uses report-only CSP in development", () => {
    const headers = buildSecurityHeaders({
      appEnv: "development",
      cspNonce: "ABcd1234==",
    });

    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("falls back to Clerk wildcard origins when the publishable key host cannot be parsed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const testHeaders = buildSecurityHeaders({
      appEnv: "production",
      cspNonce: "ABcd1234==",
      clerkPublishableKey: "pk_test_not-valid-base64!!!",
    });
    const testCsp = testHeaders["Content-Security-Policy"];
    if (!testCsp) {
      throw new Error("Expected enforcing CSP header in production");
    }
    expect(testCsp).toContain("https://*.clerk.accounts.dev");
    expect(testCsp).toContain("frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev");

    const liveHeaders = buildSecurityHeaders({
      appEnv: "production",
      cspNonce: "ABcd1234==",
      clerkPublishableKey: "pk_live_not-valid-base64!!!",
    });
    const liveCsp = liveHeaders["Content-Security-Policy"];
    if (!liveCsp) {
      throw new Error("Expected enforcing CSP header in production");
    }
    expect(liveCsp).toContain("https://*.clerk.com");

    warn.mockRestore();
  });
});
