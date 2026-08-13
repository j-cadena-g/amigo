import { describe, expect, it } from "vitest";
import {
  AGENTIC_LOCAL_DEV_KEYS,
  classifyLocalDevSecrets,
  envForLocalViteWorker,
  formatMissingAgenticNote,
  REQUIRED_LOCAL_DEV_KEYS,
} from "./local-dev-secrets.mjs";

describe("classifyLocalDevSecrets", () => {
  const manifestKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_D1_DATABASE_ID",
    "CLOUDFLARE_KV_NAMESPACE_ID",
    "CLOUDFLARE_CUSTOM_DOMAIN",
    "APP_ENV",
    "APP_ORIGIN",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "VAPID_SUBJECT",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "AGENT_LOGIN_EMAIL",
    "AGENT_LOGIN_PASSWORD",
  ];

  it("passes when only required keys are set", () => {
    const result = classifyLocalDevSecrets(manifestKeys, {
      APP_ENV: "development",
      APP_ORIGIN: "http://localhost:5190",
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
    });

    expect(result.missingRequired).toEqual([]);
    expect(result.presentRequired).toEqual(REQUIRED_LOCAL_DEV_KEYS);
    expect(result.missingOptional).toEqual([
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_D1_DATABASE_ID",
      "CLOUDFLARE_KV_NAMESPACE_ID",
      "CLOUDFLARE_CUSTOM_DOMAIN",
      "VAPID_SUBJECT",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
    ]);
    expect(result.missingAgentic).toEqual(AGENTIC_LOCAL_DEV_KEYS);
  });

  it("fails when Clerk keys are missing", () => {
    const result = classifyLocalDevSecrets(manifestKeys, {
      APP_ENV: "development",
      APP_ORIGIN: "http://localhost:5190",
    });

    expect(result.missingRequired).toEqual([
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
    ]);
  });

  it("treats agent login keys as present when set", () => {
    const result = classifyLocalDevSecrets(manifestKeys, {
      APP_ENV: "development",
      APP_ORIGIN: "http://localhost:5190",
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
      AGENT_LOGIN_EMAIL: "agent@example.com",
      AGENT_LOGIN_PASSWORD: "password",
    });

    expect(result.missingAgentic).toEqual([]);
    expect(result.presentAgentic).toEqual(AGENTIC_LOCAL_DEV_KEYS);
  });
});

describe("formatMissingAgenticNote", () => {
  it("returns null when agentic keys are present", () => {
    expect(formatMissingAgenticNote([])).toBeNull();
  });

  it("warns that seed claim needs email and password is optional form fill", () => {
    expect(formatMissingAgenticNote(AGENTIC_LOCAL_DEV_KEYS)).toBe(
      "note: agentic login keys not set (AGENT_LOGIN_EMAIL, AGENT_LOGIN_PASSWORD) — seed household claim needs AGENT_LOGIN_EMAIL; AGENT_LOGIN_PASSWORD is optional last-resort form fill (prefer pnpm run agent:signin-url)",
    );
  });

  it("warns only about seed claim when email is missing", () => {
    expect(formatMissingAgenticNote(["AGENT_LOGIN_EMAIL"])).toBe(
      "note: agentic login keys not set (AGENT_LOGIN_EMAIL) — seed household claim needs AGENT_LOGIN_EMAIL",
    );
  });

  it("warns that password is optional last-resort form fill", () => {
    expect(formatMissingAgenticNote(["AGENT_LOGIN_PASSWORD"])).toBe(
      "note: agentic login keys not set (AGENT_LOGIN_PASSWORD) — AGENT_LOGIN_PASSWORD is optional last-resort form fill (prefer pnpm run agent:signin-url)",
    );
  });
});

describe("envForLocalViteWorker", () => {
  it("forwards AGENT_LOGIN_EMAIL but strips AGENT_LOGIN_PASSWORD", () => {
    const result = envForLocalViteWorker({
      APP_ENV: "development",
      AGENT_LOGIN_EMAIL: "agent@example.com",
      AGENT_LOGIN_PASSWORD: "secret",
    });

    expect(result.CLOUDFLARE_INCLUDE_PROCESS_ENV).toBe("true");
    expect(result.AGENT_LOGIN_EMAIL).toBe("agent@example.com");
    expect(result.AGENT_LOGIN_PASSWORD).toBeUndefined();
  });
});
