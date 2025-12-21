import { NextResponse } from "next/server";
import { deleteSession, getSessionCookieOptions } from "@/lib/session";

export async function GET() {
  // Delete session from Valkey
  await deleteSession();

  // Clear session cookie
  const cookieOptions = getSessionCookieOptions();

  // Redirect to Authentik's logout endpoint
  // Authentik uses /application/o/<slug>/end-session/ or we can use the base logout
  const authentikIssuer = process.env["AUTHENTIK_ISSUER"] ?? "https://auth.cadenalabs.net/application/o/amigo/";
  const appUrl = process.env["APP_URL"] ?? "https://dev-amigo.cadenalabs.net";
  // Use OIDC end_session_endpoint with post_logout_redirect_uri
  const logoutUrl = `${authentikIssuer}end-session/?post_logout_redirect_uri=${encodeURIComponent(appUrl)}`;

  const response = NextResponse.redirect(logoutUrl);

  response.cookies.delete({
    name: cookieOptions.name,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
  });

  return response;
}

export async function POST() {
  return GET();
}
