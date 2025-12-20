import { NextResponse } from "next/server";
import * as client from "openid-client";
import { getOIDCConfig, getCallbackUrl } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const config = await getOIDCConfig();
  const callbackUrl = getCallbackUrl();

  // Generate PKCE code verifier and state
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  // Build authorization URL
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  // Store code verifier and state in cookies for callback verification
  const cookieStore = await cookies();
  const isProduction = process.env["NODE_ENV"] === "production";

  cookieStore.set("oidc_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  cookieStore.set("oidc_state", state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  return NextResponse.redirect(authUrl.href);
}
