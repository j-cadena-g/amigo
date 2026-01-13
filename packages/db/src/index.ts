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
 * Wraps a database operation with household context for RLS.
 * Sets app.current_household_id in the PostgreSQL session so that
 * row-level security policies can enforce data isolation.
 * Optionally sets app.current_user_auth_id for audit logging attribution.
 */
export async function withRLS<T>(
  householdId: string,
  callback: (tx: Transaction) => Promise<T>,
  authId?: string
): Promise<T> {
  if (!householdId) {
    throw new Error("householdId is required for RLS");
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_household_id', ${householdId}, true)`
    );
    if (authId) {
      await tx.execute(
        sql`SELECT set_config('app.current_user_auth_id', ${authId}, true)`
      );
    }
    return callback(tx);
  });
}

/**
 * Wraps a database operation with user context for audit logging.
 * Sets app.current_user_auth_id in the PostgreSQL session so that
 * audit triggers can record who made the change.
 *
 * Use this for mutations that need audit attribution but don't need RLS.
 * For operations that need both, use withRLS() with the authId parameter.
 */
export async function withAuditContext<T>(
  authId: string,
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  if (!authId) {
    throw new Error("authId is required for audit context");
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_user_auth_id', ${authId}, true)`
    );
    return callback(tx);
  });
}

export * from "./schema";
export * from "./queries/analytics";
export * from "./triggers";

// Re-export commonly used drizzle-orm operators
export { desc, asc, eq, ne, gt, gte, lt, lte, isNull, isNotNull, and, or, sql } from "drizzle-orm";
