import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { healthRouter } from "../health";

// Get mocked modules
const mockDb = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const mockCheckRedisHealth = vi.hoisted(() => vi.fn());

vi.mock("@amigo/db", () => ({
  db: mockDb,
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

vi.mock("../../lib/redis", () => ({
  checkRedisHealth: mockCheckRedisHealth,
}));

describe("Health Route", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono().route("/api/health", healthRouter);
  });

  it("returns 200 when all services are healthy", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckRedisHealth.mockResolvedValue({ status: "healthy", latency: 1 });

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.services.postgres.status).toBe("ok");
    expect(body.services.valkey.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.services.postgres.latencyMs).toBeDefined();
    expect(body.services.valkey.latencyMs).toBeDefined();
  });

  it("returns 503 when Postgres is unhealthy", async () => {
    mockDb.execute.mockRejectedValue(new Error("Connection refused"));
    mockCheckRedisHealth.mockResolvedValue({ status: "healthy", latency: 1 });

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("error");
    expect(body.services.postgres.error).toBe("Connection refused");
    expect(body.services.valkey.status).toBe("ok");
  });

  it("returns 200 with degraded status when Valkey is unavailable but Postgres is ok", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckRedisHealth.mockResolvedValue({
      status: "degraded",
      error: "Redis not configured",
    });

    const res = await app.request("/api/health");
    const body = await res.json();

    // Degraded mode returns 200 (server is still functional)
    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.services.postgres.status).toBe("ok");
    expect(body.services.valkey.status).toBe("degraded");
    expect(body.services.valkey.error).toBe("Redis not configured");
  });

  it("returns 200 with error status when Valkey connection fails", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockCheckRedisHealth.mockResolvedValue({
      status: "error",
      error: "Redis connection failed",
    });

    const res = await app.request("/api/health");
    const body = await res.json();

    // Valkey error returns 200 (postgres is the critical service)
    expect(res.status).toBe(200);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("ok");
    expect(body.services.valkey.status).toBe("error");
    expect(body.services.valkey.error).toBe("Redis connection failed");
  });

  it("returns 503 when both services are unhealthy", async () => {
    mockDb.execute.mockRejectedValue(new Error("DB down"));
    mockCheckRedisHealth.mockResolvedValue({
      status: "error",
      error: "Redis down",
    });

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("error");
    expect(body.services.valkey.status).toBe("error");
  });
});
