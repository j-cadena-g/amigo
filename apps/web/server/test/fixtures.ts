import {
  budgets,
  financialCategories,
  getDb,
  households,
  transactions,
  users,
  type DrizzleD1,
} from "@amigo/db";

const nowMs = () => Date.now();

export function createTestDb(d1: D1Database): DrizzleD1 {
  return getDb(d1);
}

export async function seedHouseholdWithOwner(
  db: DrizzleD1,
  options: {
    householdId: string;
    ownerId: string;
    ownerAuthId: string;
    timezone?: string;
    homeCurrency?: "CAD" | "USD";
    householdName?: string;
  }
) {
  const ts = nowMs();
  await db.insert(households).values({
    id: options.householdId,
    name: options.householdName ?? "Test Household",
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

export async function seedFinancialCategory(
  db: DrizzleD1,
  options: {
    id: string;
    householdId: string;
    name: string;
    type?: "income" | "expense";
    parentId?: string | null;
  }
) {
  const ts = nowMs();
  await db.insert(financialCategories).values({
    id: options.id,
    householdId: options.householdId,
    parentId: options.parentId ?? null,
    name: options.name,
    type: options.type ?? "expense",
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
    restoreAllowedUntil?: Date | null;
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
    restoreAllowedUntil: options.restoreAllowedUntil ?? null,
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
    categoryId?: string | null;
    date?: string;
    externalId?: string | null;
    userDisplayName?: string | null;
  }
) {
  const ts = nowMs();
  const defaultTestDate = "2026-01-15";
  await db.insert(transactions).values({
    id: options.id,
    householdId: options.householdId,
    userId: options.userId,
    budgetId: options.budgetId ?? null,
    amount: options.amount,
    currency: "CAD",
    categoryId: options.categoryId ?? null,
    category: options.category,
    description: options.category,
    type: "expense",
    date: options.date ?? defaultTestDate,
    externalId: options.externalId ?? null,
    userDisplayName: options.userDisplayName ?? null,
    createdAt: new Date(ts),
    updatedAt: new Date(ts),
  });
}

export function testSession(options: {
  userId: string;
  householdId: string;
  role?: "owner" | "admin" | "member";
}) {
  return {
    userId: options.userId,
    householdId: options.householdId,
    role: options.role ?? "owner",
    email: "owner@example.com",
    name: "Owner",
  };
}

export function clerkAuth(options: {
  userId: string;
  email?: string;
  name?: string;
}) {
  return {
    userId: options.userId,
    sessionClaims: {
      email: options.email ?? "deleted@example.com",
      name: options.name ?? "Deleted Member",
    },
  } as never;
}
