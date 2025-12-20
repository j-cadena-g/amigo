import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieOptions } from "@/lib/session";
import { getPostLogoutRedirect } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Delete session from Valkey
  await deleteSession();

  // Clear session cookie
  const cookieOptions = getSessionCookieOptions();
  const response = NextResponse.redirect(
    new URL(getPostLogoutRedirect(), request.url)
  );

  response.cookies.delete({
    name: cookieOptions.name,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
  });

  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}
