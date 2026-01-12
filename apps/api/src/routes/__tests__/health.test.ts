import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { healthRouter } from "../health";

// Get mocked modules
const mockDb = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  ping: vi.fn(),
}));

vi.mock("@amigo/db", () => ({
  db: mockDb,
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

vi.mock("../../lib/redis", () => ({
  redis: mockRedis,
}));

describe("Health Route", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono().route("/api/health", healthRouter);
  });

  it("returns 200 when all services are healthy", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");

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
    mockRedis.ping.mockResolvedValue("PONG");

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("error");
    expect(body.services.postgres.error).toBe("Connection refused");
    expect(body.services.valkey.status).toBe("ok");
  });

  it("returns 503 when Valkey is unhealthy", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockRejectedValue(new Error("Redis connection failed"));

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("ok");
    expect(body.services.valkey.status).toBe("error");
    expect(body.services.valkey.error).toBe("Redis connection failed");
  });

  it("returns 503 when Valkey returns unexpected response", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("UNEXPECTED");

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.valkey.status).toBe("error");
    expect(body.services.valkey.error).toContain("Unexpected response");
  });

  it("returns 503 when both services are unhealthy", async () => {
    mockDb.execute.mockRejectedValue(new Error("DB down"));
    mockRedis.ping.mockRejectedValue(new Error("Redis down"));

    const res = await app.request("/api/health");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.services.postgres.status).toBe("error");
    expect(body.services.valkey.status).toBe("error");
  });
});
