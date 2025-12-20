import * as client from "openid-client";

let _config: client.Configuration | null = null;

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export async function getOIDCConfig(): Promise<client.Configuration> {
  if (_config) {
    return _config;
  }

  const issuer = getEnvOrThrow("AUTHELIA_ISSUER");
  const clientId = getEnvOrThrow("AUTHELIA_CLIENT_ID");
  const clientSecret = getEnvOrThrow("AUTHELIA_CLIENT_SECRET");

  _config = await client.discovery(
    new URL(issuer),
    clientId,
    clientSecret,
    undefined,
    {
      execute: [client.allowInsecureRequests],
    }
  );

  return _config;
}

export function getAppUrl(): string {
  return process.env["APP_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
}

export function getCallbackUrl(): string {
  return `${getAppUrl()}/api/auth/callback`;
}

export function getPostLoginRedirect(): string {
  return "/";
}

export function getPostLogoutRedirect(): string {
  return "/";
}

export interface OIDCUserInfo {
  sub: string;
  email: string;
  name?: string;
  preferred_username?: string;
}
