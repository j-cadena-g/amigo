import * as client from "openid-client";

let _config: client.Configuration | null = null;
let _configPromise: Promise<client.Configuration> | null = null;

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function discoverWithRetry(
  issuer: URL,
  clientId: string,
  clientSecret: string,
  maxRetries = 5
): Promise<client.Configuration> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const config = await client.discovery(
        issuer,
        clientId,
        clientSecret,
        undefined,
        {
          execute: [client.allowInsecureRequests],
          timeout: 30000, // 30 second timeout
        }
      );
      return config;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`OIDC discovery attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 2s, 4s, 8s, 16s)
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("OIDC discovery failed");
}

export async function getOIDCConfig(): Promise<client.Configuration> {
  // Return cached config if available
  if (_config) {
    return _config;
  }

  // If discovery is already in progress, wait for it
  if (_configPromise) {
    return _configPromise;
  }

  // Authentik OIDC issuer URL format: https://auth.example.com/application/o/<slug>/
  const issuer = getEnvOrThrow("AUTHENTIK_ISSUER");
  const clientId = getEnvOrThrow("AUTHENTIK_CLIENT_ID");
  const clientSecret = getEnvOrThrow("AUTHENTIK_CLIENT_SECRET");

  // Start discovery and cache the promise to prevent concurrent attempts
  _configPromise = discoverWithRetry(new URL(issuer), clientId, clientSecret);

  try {
    _config = await _configPromise;
    return _config;
  } catch (error) {
    // Clear the promise so next call can retry
    _configPromise = null;
    throw error;
  }
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
