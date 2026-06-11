interface SecurityHeadersOptions {
  appEnv: string;
  cspNonce: string;
  clerkPublishableKey?: string;
}

function getClerkFrontendApiHost(publishableKey?: string): string | null {
  if (!publishableKey) return null;
  const match = publishableKey.match(/^pk_(?:test|live)_(.+)$/);
  if (!match?.[1]) return null;
  try {
    const padded = match[1].padEnd(match[1].length + ((4 - (match[1].length % 4)) % 4), "=");
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const host = decoded.replace(/\$$/, "").trim();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

function buildCsp(cspNonce: string, clerkPublishableKey?: string): string {
  const clerkHost = getClerkFrontendApiHost(clerkPublishableKey);
  const clerkOrigin = clerkHost ? `https://${clerkHost}` : null;

  const scriptSrc = [
    "'self'",
    `'nonce-${cspNonce}'`,
    "https://challenges.cloudflare.com",
    ...(clerkOrigin ? [clerkOrigin] : []),
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https:",
    "wss:",
    ...(clerkOrigin ? [clerkOrigin] : []),
  ].join(" ");

  const frameSrc = [
    "'self'",
    "https://challenges.cloudflare.com",
    ...(clerkOrigin ? [clerkOrigin] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSrc}`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

export function buildSecurityHeaders({
  appEnv,
  cspNonce,
  clerkPublishableKey,
}: SecurityHeadersOptions): Record<string, string> {
  const csp = buildCsp(cspNonce, clerkPublishableKey);
  const isDev = appEnv === "development";

  const headers: Record<string, string> = {
    ...(isDev
      ? { "Content-Security-Policy-Report-Only": csp }
      : { "Content-Security-Policy": csp }),
    "Permissions-Policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };

  if (!isDev) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}
