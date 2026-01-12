import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import { getOIDCConfig, getPostLoginRedirect, getAppUrl } from "@/lib/auth";
import { createSession, getSessionCookieOptions } from "@/lib/session";
import {
  getOrphanedDataSummary,
  createPendingRestoreToken,
  PENDING_RESTORE_COOKIE,
} from "@/lib/restore";
import { db, eq } from "@amigo/db";
import { users, households } from "@amigo/db/schema";

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get("oidc_code_verifier")?.value;
  const expectedState = request.cookies.get("oidc_state")?.value;

  if (!codeVerifier || !expectedState) {
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
      throw new Error("Missing required userinfo (sub, email)");
    }

    // Find or create user
    let user = await db.query.users.findFirst({
      where: eq(users.authId, sub),
    });

    if (!user) {
      // Single-household-per-instance model:
      // Check if a household already exists - if so, join it
      // If not, create the first (and only) household for this instance
      let household = await db.query.households.findFirst();
      let isFirstUser = false;

      if (!household) {
        // First user - create the household for this instance
        isFirstUser = true;
        const [newHousehold] = await db
          .insert(households)
          .values({
            name: "My Household",
          })
          .returning();

        if (!newHousehold) {
          throw new Error("Failed to create household");
        }

        household = newHousehold;
      }

      // Create the user and assign to the household
      // First user becomes owner, subsequent users become members
      const [newUser] = await db
        .insert(users)
        .values({
          authId: sub,
          email,
          name: name ?? null,
          householdId: household.id,
          role: isFirstUser ? "owner" : "member",
        })
        .returning();

      if (!newUser) {
        throw new Error("Failed to create user");
      }

      user = newUser;
    } else if (user.deletedAt) {
      // Soft-deleted user trying to log back in
      // Redirect to restore page with pending restore token
      const dataSummary = await getOrphanedDataSummary(user.id, user.householdId);

      const token = await createPendingRestoreToken({
        userId: user.id,
        householdId: user.householdId,
        authId: sub,
        email,
        name: name ?? null,
        dataSummary,
      });

      const response = NextResponse.redirect(
        new URL("/restore-account", getAppUrl())
      );

      // Set pending restore cookie
      const cookieOptions = getSessionCookieOptions();
      response.cookies.set(PENDING_RESTORE_COOKIE, token, {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: cookieOptions.path,
        domain: cookieOptions.domain,
        maxAge: 60 * 15, // 15 minutes
      });

      // Clear OIDC cookies
      response.cookies.delete({ name: "oidc_code_verifier", path: "/", domain: cookieDomain });
      response.cookies.delete({ name: "oidc_state", path: "/", domain: cookieDomain });

      return response;
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

    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/?error=auth_failed", getAppUrl())
    );
  }
}
