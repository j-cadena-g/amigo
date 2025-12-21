import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import { getOIDCConfig, getPostLoginRedirect, getAppUrl } from "@/lib/auth";
import { createSession, getSessionCookieOptions } from "@/lib/session";
import { db, eq } from "@amigo/db";
import { users, households } from "@amigo/db/schema";

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get("oidc_code_verifier")?.value;
  const expectedState = request.cookies.get("oidc_state")?.value;

  console.log("Callback received. codeVerifier:", !!codeVerifier, "expectedState:", !!expectedState);
  console.log("Query params:", request.nextUrl.search);

  if (!codeVerifier || !expectedState) {
    console.log("Missing OIDC cookies, redirecting to login");
    return NextResponse.redirect(
      new URL("/api/auth/login", getAppUrl())
    );
  }

  try {
    const config = await getOIDCConfig();
    const isProduction = process.env["NODE_ENV"] === "production";
    const cookieDomain = isProduction ? ".cadenalabs.net" : undefined;

    // Build the callback URL with query params from the request
    // Use APP_URL as base since request.url may have internal container hostname
    const callbackUrl = new URL("/api/auth/callback", getAppUrl());
    callbackUrl.search = request.nextUrl.search;

    // Exchange authorization code for tokens
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });

    // Fetch user info from userinfo endpoint (has full profile/email claims)
    const userInfo = await client.fetchUserInfo(config, tokens.access_token, tokens.claims()?.sub ?? "");

    const sub = userInfo.sub;
    const email = userInfo.email as string | undefined;
    const name = (userInfo.name as string | undefined) ??
                 (userInfo.preferred_username as string | undefined);

    if (!sub || !email) {
      console.error("Missing userinfo. Sub:", sub, "Email:", email);
      throw new Error("Missing required userinfo (sub, email)");
    }

    // Find or create user
    let user = await db.query.users.findFirst({
      where: eq(users.authId, sub),
    });

    if (!user) {
      // Create a new household for the user
      const [newHousehold] = await db
        .insert(households)
        .values({
          name: name ? `${name}'s Household` : "My Household",
        })
        .returning();

      if (!newHousehold) {
        throw new Error("Failed to create household");
      }

      // Create the user
      const [newUser] = await db
        .insert(users)
        .values({
          authId: sub,
          email,
          name: name ?? null,
          householdId: newHousehold.id,
        })
        .returning();

      if (!newUser) {
        throw new Error("Failed to create user");
      }

      user = newUser;
    } else {
      // Update user info if changed
      if (user.email !== email || user.name !== name) {
        const [updatedUser] = await db
          .update(users)
          .set({
            email,
            name: name ?? user.name,
          })
          .where(eq(users.id, user.id))
          .returning();

        if (updatedUser) {
          user = updatedUser;
        }
      }
    }

    // Create session
    const sessionId = await createSession(user);

    // Set session cookie
    const cookieOptions = getSessionCookieOptions();
    const response = NextResponse.redirect(
      new URL(getPostLoginRedirect(), getAppUrl())
    );

    response.cookies.set(cookieOptions.name, sessionId, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      domain: cookieOptions.domain,
      maxAge: cookieOptions.maxAge,
    });

    // Clear OIDC cookies on the response
    response.cookies.delete({ name: "oidc_code_verifier", path: "/", domain: cookieDomain });
    response.cookies.delete({ name: "oidc_state", path: "/", domain: cookieDomain });

    console.log("Login successful, redirecting to", getPostLoginRedirect());
    return response;
  } catch (error) {
    console.error("OIDC callback error:", error);
    return NextResponse.redirect(
      new URL("/?error=auth_failed", getAppUrl())
    );
  }
}
