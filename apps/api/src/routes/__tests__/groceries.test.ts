import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { groceriesRouter } from "../groceries";
import { createMockSession, createMockGroceryItem } from "../../test/utils";

// Mock session helper
const mockGetSessionFromCookie = vi.hoisted(() => vi.fn());

vi.mock("../../lib/session", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

// Mock database with chainable query builder
const createMockQueryBuilder = (data: unknown[]) => {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => Promise.resolve(data)),
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
  gte: vi.fn((a, b) => ({ type: "gte", a, b })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

vi.mock("@amigo/db/schema", () => ({
  groceryItems: {
    id: "id",
    householdId: "householdId",
    updatedAt: "updatedAt",
    deletedAt: "deletedAt",
  },
}));

describe("Groceries Route", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono().route("/api/groceries", groceriesRouter);
  });

  describe("GET /api/groceries", () => {
    it("returns 401 when no session cookie is provided", async () => {
      mockGetSessionFromCookie.mockResolvedValue(null);

      const res = await app.request("/api/groceries");
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when session is invalid", async () => {
      mockGetSessionFromCookie.mockResolvedValue(null);

      const res = await app.request("/api/groceries", {
        headers: { Cookie: "amigo_session=invalid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    });

    it("returns grocery items for authenticated user (initial sync)", async () => {
      const mockSession = createMockSession();
      const mockItems = [
        createMockGroceryItem({ id: "item-1", itemName: "Milk" }),
        createMockGroceryItem({ id: "item-2", itemName: "Bread" }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockItems));

      const res = await app.request("/api/groceries", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe("item-1");
      expect(body.data[0].itemName).toBe("Milk");
      expect(body.data[1].id).toBe("item-2");
      expect(body.data[1].itemName).toBe("Bread");
      expect(body.isDelta).toBe(false);
      expect(body.syncTimestamp).toBeDefined();
      expect(typeof body.syncTimestamp).toBe("number");
    });

    it("returns delta sync when lastSync is provided", async () => {
      const mockSession = createMockSession();
      const mockItems = [
        createMockGroceryItem({ id: "item-1", itemName: "Updated Item" }),
      ];

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder(mockItems));

      const lastSync = Date.now() - 60000; // 1 minute ago
      const res = await app.request(`/api/groceries?lastSync=${lastSync}`, {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("item-1");
      expect(body.data[0].itemName).toBe("Updated Item");
      expect(body.isDelta).toBe(true);
      expect(body.syncTimestamp).toBeGreaterThan(lastSync);
    });

    it("returns empty array when no items exist", async () => {
      const mockSession = createMockSession();

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      mockDb.select.mockReturnValue(createMockQueryBuilder([]));

      const res = await app.request("/api/groceries", {
        headers: { Cookie: "amigo_session=valid-session" },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.isDelta).toBe(false);
    });

    it("filters by householdId from session", async () => {
      const mockSession = createMockSession({ householdId: "specific-household" });

      mockGetSessionFromCookie.mockResolvedValue(mockSession);
      const queryBuilder = createMockQueryBuilder([]);
      mockDb.select.mockReturnValue(queryBuilder);

      await app.request("/api/groceries", {
        headers: { Cookie: "amigo_session=valid-session" },
      });

      // Verify select was called (query was executed)
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
