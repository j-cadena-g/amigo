import { cookies } from "next/headers";
import { redis, publishSessionInvalidation } from "./redis";
import type { User, UserRole } from "@amigo/db";

const SESSION_COOKIE = "amigo_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  userId: string;
  householdId: string;
  email: string;
  name: string | null;
  authId: string;
  role: UserRole;
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
    role: user.role,
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

  const session = JSON.parse(data) as Session;

  // Handle legacy sessions without role - fetch from database and update session
  if (!session.role) {
    const { db, eq } = await import("@amigo/db");
    const { users } = await import("@amigo/db/schema");

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (user) {
      session.role = user.role;
      // Update session in Redis with the role
      await redis.setex(
        getSessionKey(sessionId),
        SESSION_TTL,
        JSON.stringify(session)
      );
    } else {
      // User not found, invalid session
      return null;
    }
  }

  return session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await redis.del(getSessionKey(sessionId));
    // Notify API server to close any WebSocket connections for this session
    await publishSessionInvalidation(sessionId);
  }
}

export async function updateSessionHousehold(newHouseholdId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return false;
  }

  const data = await redis.get(getSessionKey(sessionId));
  if (!data) {
    return false;
  }

  const session = JSON.parse(data) as Session;
  session.householdId = newHouseholdId;

  await redis.setex(
    getSessionKey(sessionId),
    SESSION_TTL,
    JSON.stringify(session)
  );

  return true;
}

export async function updateSessionRole(newRole: UserRole): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return false;
  }

  const data = await redis.get(getSessionKey(sessionId));
  if (!data) {
    return false;
  }

  const session = JSON.parse(data) as Session;
  session.role = newRole;

  await redis.setex(
    getSessionKey(sessionId),
    SESSION_TTL,
    JSON.stringify(session)
  );

  return true;
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
