import {
  budgets,
  getDb,
  households,
  transactions,
  users,
  type DrizzleD1,
} from "@amigo/db";
import { todayInTz } from "../lib/dates";

const nowMs = () => Date.now();

export function createTestDb(d1: D1Database): DrizzleD1 {
  return getDb(d1);
}

export async function seedHouseholdWithOwner(
  db: DrizzleD1,
  options: {
    householdId: string;
    clerkOrgId: string;
    ownerId: string;
    ownerAuthId: string;
    timezone?: string;
    homeCurrency?: "CAD" | "USD";
  }
) {
  const ts = nowMs();
  await db.insert(households).values({
    id: options.householdId,
    clerkOrgId: options.clerkOrgId,
    name: "Test Household",
    homeCurrency: options.homeCurrency ?? "CAD",
    timezone: options.timezone ?? "UTC",
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
  await db.insert(users).values({
    id: options.ownerId,
    authId: options.ownerAuthId,
    email: "owner@example.com",
    name: "Owner",
    householdId: options.householdId,
    role: "owner",
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
}

export async function seedSoftDeletedMember(
  db: DrizzleD1,
  options: {
    userId: string;
    authId: string;
    householdId: string;
    email?: string;
    name?: string;
  }
) {
  const ts = nowMs();
  await db.insert(users).values({
    id: options.userId,
    authId: options.authId,
    email: options.email ?? "deleted@example.com",
    name: options.name ?? "Deleted Member",
    householdId: options.householdId,
    role: "member",
    deletedAt: new Date(ts),
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
}

export async function seedMonthlyBudget(
  db: DrizzleD1,
  options: {
    id: string;
    householdId: string;
    userId?: string | null;
    name: string;
    category: string;
    limitAmount: number;
    limitAmountHome?: number;
  }
) {
  const ts = nowMs();
  await db.insert(budgets).values({
    id: options.id,
    householdId: options.householdId,
    userId: options.userId ?? null,
    name: options.name,
    category: options.category,
    limitAmount: options.limitAmount,
    limitAmountHome: options.limitAmountHome ?? options.limitAmount,
    currency: "CAD",
    period: "monthly",
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
}

export async function seedExpenseTransaction(
  db: DrizzleD1,
  options: {
    id: string;
    householdId: string;
    userId: string;
    budgetId?: string | null;
    amount: number;
    category: string;
    date?: string;
    externalId?: string | null;
    userDisplayName?: string | null;
  }
) {
  const ts = nowMs();
  const timeZone = "UTC";
  await db.insert(transactions).values({
    id: options.id,
    householdId: options.householdId,
    userId: options.userId,
    budgetId: options.budgetId ?? null,
    amount: options.amount,
    currency: "CAD",
    category: options.category,
    description: options.category,
    type: "expense",
    date: options.date ?? todayInTz(timeZone),
    externalId: options.externalId ?? null,
    userDisplayName: options.userDisplayName ?? null,
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
}

export function testSession(options: {
  userId: string;
  householdId: string;
  orgId?: string;
}) {
  return {
    userId: options.userId,
    householdId: options.householdId,
    orgId: options.orgId ?? "org_test",
    role: "owner" as const,
    email: "owner@example.com",
    name: "Owner",
  };
}

export function clerkAuth(options: {
  userId: string;
  orgId: string;
  email?: string;
  name?: string;
}) {
  return {
    userId: options.userId,
    orgId: options.orgId,
    sessionClaims: {
      email: options.email ?? "deleted@example.com",
      name: options.name ?? "Deleted Member",
    },
  } as never;
}
