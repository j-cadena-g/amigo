import { cookies } from "next/headers";
import { redis } from "./redis";
import type { User } from "@amigo/db";

const SESSION_COOKIE = "amigo_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  userId: string;
  householdId: string;
  email: string;
  name: string | null;
  authId: string;
}

function getSessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function createSession(user: User): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: Session = {
    userId: user.id,
    householdId: user.householdId,
    email: user.email,
    name: user.name,
    authId: user.authId,
  };

  await redis.setex(
    getSessionKey(sessionId),
    SESSION_TTL,
    JSON.stringify(session)
  );

  return sessionId;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return null;
  }

  const data = await redis.get(getSessionKey(sessionId));
  if (!data) {
    return null;
  }

  // Refresh TTL on access
  await redis.expire(getSessionKey(sessionId), SESSION_TTL);

  return JSON.parse(data) as Session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await redis.del(getSessionKey(sessionId));
  }
}

export function getSessionCookieOptions() {
  const isProduction = process.env["NODE_ENV"] === "production";
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    domain: isProduction ? ".cadenalabs.net" : undefined,
    maxAge: SESSION_TTL,
  };
}
