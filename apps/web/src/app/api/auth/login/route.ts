import { NextResponse } from "next/server";
import * as client from "openid-client";
import { getOIDCConfig, getCallbackUrl } from "@/lib/auth";

export async function GET() {
  const config = await getOIDCConfig();
  const callbackUrl = getCallbackUrl();

  // Generate PKCE code verifier and state
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  // Generate a longer state (Authelia requires at least 8 characters)
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = Buffer.from(stateBytes).toString("base64url");

  // Build authorization URL
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const isProduction = process.env["NODE_ENV"] === "production";
  const cookieDomain = isProduction ? ".cadenalabs.net" : undefined;

  // Return an HTML page that sets cookies and redirects after a brief delay
  // This ensures cookies are fully set before the redirect to Authelia
  // (fixes race condition with password managers like 1Password)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .loader {
      text-align: center;
      color: #666;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Redirecting to login...</p>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "${authUrl.href}";
    }, 100);
  </script>
</body>
</html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
    },
  });

  // Set OIDC cookies on the response
  response.cookies.set("oidc_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    domain: cookieDomain,
    maxAge: 60 * 10, // 10 minutes
  });

  response.cookies.set("oidc_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    domain: cookieDomain,
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
