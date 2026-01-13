import { redis } from "./redis";
import type { UserRole } from "@amigo/db";

const SESSION_COOKIE = "amigo_session";

export interface Session {
  userId: string;
  householdId: string;
  email: string;
  name: string | null;
  authId: string;
  role: UserRole;
}

export interface SessionWithId extends Session {
  sessionId: string;
}

function getSessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function getSessionFromCookie(
  cookieHeader: string | null
): Promise<SessionWithId | null> {
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );

  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }

  const data = await redis.get(getSessionKey(sessionId));
  if (!data) {
    return null;
  }

  const session = JSON.parse(data) as Session;
  return { ...session, sessionId };
}
