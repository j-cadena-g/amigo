import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { transactionsRouter } from "../transactions";
import { createMockSession, createMockTransaction } from "../../test/utils";

// Mock session helper
const mockGetSessionFromCookie = vi.hoisted(() => vi.fn());

vi.mock("../../lib/session", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

// Mock database with chainable query builder
const createMockQueryBuilder = (data: unknown[]) => {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => Promise.resolve(data)),
  };
  return builder;
};

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@amigo/db", () => ({
  db: mockDb,
  desc: vi.fn((col) => col),
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args) => ({ type: "and", args })),
  or: vi.fn((...args) => ({ type: "or", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

vi.mock("@amigo/db/schema", () => ({
  transactions: {
    id: "id",
    householdId: "householdId",
    userId: "userId",
    budgetId: "budgetId",
    amount: "amount",
    currency: "currency",
    exchangeRateToHome: "exchangeRateToHome",
    category: "category",
    description: "description",
    type: "type",
    date: "date",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    deletedAt: "deletedAt",
  },
  budgets: {
    id: "id",
    name: "name",
    userId: "userId",
  },
}));

describe("Transactions Route", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono().route("/api/transactions", transactionsRouter);
  });

  describe("GET /api/transactions", () => {
    it("returns 401 when no session cookie is provided", async () => {
      mockGetSessionFromCookie.mockResolvedValue(null);

      const res = await app.request("/api/transactions");
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    });

    it("returns transactions with default pagination", async () => {
      const mockSession = createMockSession();
      const mockTransactions = [
        createMockTransaction({ id: "tx-1", description: "Groceries" }),
        createMockTransaction({ id: "tx-2", description: "Gas" }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
    });

    it("respects page and limit query parameters", async () => {
      const mockSession = createMockSession();
      const mockTransactions = Array(10)
        .fill(null)
        .map((_, i) => createMockTransaction({ id: `tx-${i}` }));

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions?page=2&limit=10", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.limit).toBe(10);
      expect(body.pagination.hasMore).toBe(true); // 10 items = limit, so hasMore
    });

    it("returns hasMore=false when fewer items than limit", async () => {
      const mockSession = createMockSession();
      const mockTransactions = [
        createMockTransaction({ id: "tx-1" }),
        createMockTransaction({ id: "tx-2" }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions?limit=10", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.pagination.hasMore).toBe(false);
    });

    it("filters by category when provided", async () => {
      const mockSession = createMockSession();
      const mockTransactions = [
        createMockTransaction({ id: "tx-1", category: "Food" }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions?category=Food", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it("serializes dates as YYYY-MM-DD strings", async () => {
      const mockSession = createMockSession();
      const mockTransactions = [
        createMockTransaction({
          id: "tx-1",
          date: new Date("2026-01-15T00:00:00.000Z"),
        }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data[0].date).toBe("2026-01-15");
    });

    it("enforces max limit of 100", async () => {
      const mockSession = createMockSession();

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder([]));

      // Request with limit > 100 should be rejected by zod validator
      const res = await app.request("/api/transactions?limit=101", {
        headers: { Cookie: "amigo_session=valid-session" },
      });

      expect(res.status).toBe(400);
    });

    it("returns empty array when no transactions exist", async () => {
      const mockSession = createMockSession();

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder([]));

      const res = await app.request("/api/transactions", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.pagination.hasMore).toBe(false);
    });

    it("includes budget name in response when transaction has budgetId", async () => {
      const mockSession = createMockSession();
      const mockTransactions = [
        createMockTransaction({
          id: "tx-1",
          budgetId: "budget-1",
          budgetName: "Monthly Groceries",
        }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockTransactions));

      const res = await app.request("/api/transactions", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data[0].budgetName).toBe("Monthly Groceries");
    });
  });
});
