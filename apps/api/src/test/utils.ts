import type { Session } from "../lib/session";

/**
 * Create a mock session for testing
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    userId: "test-user-id",
    householdId: "test-household-id",
    email: "test@example.com",
    name: "Test User",
    authId: "test-auth-id",
    ...overrides,
  };
}

/**
 * Create a cookie header string with a session ID
 */
export function createSessionCookie(sessionId: string): string {
  return `amigo_session=${sessionId}`;
}

/**
 * Create mock grocery items for testing
 */
export function createMockGroceryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "grocery-item-1",
    householdId: "test-household-id",
    createdByUserId: "test-user-id",
    itemName: "Test Item",
    category: "Test Category",
    isPurchased: false,
    purchasedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock transaction for testing
 */
export function createMockTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "transaction-1",
    householdId: "test-household-id",
    userId: "test-user-id",
    budgetId: null,
    amount: "100.00",
    currency: "CAD",
    exchangeRateToHome: null,
    category: "Test Category",
    description: "Test transaction",
    type: "expense",
    date: new Date("2026-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    budgetName: null,
    ...overrides,
  };
}
