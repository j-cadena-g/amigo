import { drizzle } from "drizzle-orm/d1";
import { eq, type Column } from "drizzle-orm";
import * as schema from "./schema";

export type DrizzleD1 = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create a Drizzle ORM instance from a D1 database binding.
 * Call this in your Worker/middleware with the D1 binding from env.
 */
export function getDb(d1: D1Database): DrizzleD1 {
  return drizzle(d1, { schema });
}

/**
 * Application-level household scoping (replaces PostgreSQL RLS).
 * All data queries MUST use this helper to add a householdId filter.
 */
export function scopeToHousehold(householdIdColumn: Column, householdId: string) {
  return eq(householdIdColumn, householdId);
}

export * from "./schema";

// Re-export commonly used drizzle-orm operators
export {
  desc,
  asc,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  inArray,
  isNull,
  isNotNull,
  and,
  or,
  sql,
} from "drizzle-orm";
