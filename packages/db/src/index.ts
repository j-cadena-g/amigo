import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export type Transaction = Parameters<
  Parameters<ReturnType<typeof drizzle<typeof schema>>["transaction"]>[0]
>[0];

function getDb() {
  if (_db) return _db;

  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = postgres(connectionString, {
    max: process.env["NODE_ENV"] === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _db = drizzle(client, { schema });
  return _db;
}

// Lazy-loaded db instance - only connects when actually used
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle<typeof schema>>];
  },
});

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Wraps a database operation with audit logging context.
 * Sets the user's auth_id in the PostgreSQL session so that
 * audit triggers can capture who made the change.
 */
export async function withAuditing<T>(
  authId: string,
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  return getDb().transaction(async (tx) => {
    // SET LOCAL doesn't support parameterized values, so we use sql.raw()
    // The authId is sanitized by escaping single quotes to prevent SQL injection
    const sanitizedAuthId = authId.replace(/'/g, "''");
    await tx.execute(
      sql.raw(`SET LOCAL app.current_user_auth_id = '${sanitizedAuthId}'`)
    );
    return callback(tx);
  });
}

export * from "./schema";
export * from "./queries/analytics";
export * from "./triggers";

// Re-export commonly used drizzle-orm operators
export { desc, asc, eq, ne, gt, gte, lt, lte, isNull, isNotNull, and, or, sql } from "drizzle-orm";
