import { describe, expect, it } from "vitest";
import { isAgentSigninPath, isDirectLocalRequest } from "./agent-signin-guard";

function request(remoteAddress: string | undefined, headers: Record<string, string> = {}) {
  return { socket: { remoteAddress }, headers };
}

describe("isDirectLocalRequest", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("accepts a direct connection from %s", (address) => {
    expect(isDirectLocalRequest(request(address))).toBe(true);
  });

  it.each(["none", "same-origin", "same-site"])(
    "accepts a local browser navigation with Sec-Fetch-Site: %s",
    (site) => {
      expect(isDirectLocalRequest(request("::1", { "sec-fetch-site": site }))).toBe(true);
    }
  );

  it.each([
    ["a navigation another site started", request("127.0.0.1", { "sec-fetch-site": "cross-site" })],
    ["a LAN peer", request("192.168.1.20")],
    ["an IPv4-mapped LAN peer", request("::ffff:192.168.1.20")],
    ["an unknown peer", request(undefined)],
    ["a tunnel (cloudflared)", request("127.0.0.1", { "cf-connecting-ip": "203.0.113.9" })],
    ["a local reverse proxy", request("::1", { "x-forwarded-for": "203.0.113.9" })],
  ])("rejects %s", (_case, req) => {
    expect(isDirectLocalRequest(req)).toBe(false);
  });
});

describe("isAgentSigninPath", () => {
  it.each([
    "/dev/agent-signin",
    "/dev/agent-signin?from=agent",
    "/DEV/Agent-Signin/",
    "/dev/agent-signin.data",
    "/dev/agent%2Dsignin",
    "/dev/./agent-signin",
  ])("matches %s", (url) => {
    expect(isAgentSigninPath(url)).toBe(true);
  });

  it.each(["/", "/dashboard", "/api/health", "/dashboard?next=agent-signin"])(
    "ignores %s",
    (url) => {
      expect(isAgentSigninPath(url)).toBe(false);
    }
  );
});
