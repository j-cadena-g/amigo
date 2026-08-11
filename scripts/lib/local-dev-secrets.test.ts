import { describe, expect, it } from "vitest";
import {
  AGENTIC_LOCAL_DEV_KEYS,
  classifyLocalDevSecrets,
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
