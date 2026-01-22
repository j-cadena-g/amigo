import { vi } from "vitest";

// Mock the database module
vi.mock("@amigo/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([])),
              })),
            })),
          })),
        })),
      })),
    })),
  },
  sql: vi.fn((strings: TemplateStringsArray) => strings.join("")),
  desc: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  gte: vi.fn(),
  isNull: vi.fn(),
}));

// Mock Redis module with graceful degradation functions
vi.mock("../lib/redis", () => ({
  redis: {
    ping: vi.fn(() => Promise.resolve("PONG")),
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve("OK")),
    incr: vi.fn(() => Promise.resolve(1)),
    expire: vi.fn(() => Promise.resolve(1)),
    publish: vi.fn(() => Promise.resolve(1)),
  },
  subscriber: {
    subscribe: vi.fn(),
    on: vi.fn(),
  },
  CHANNELS: {
    HOUSEHOLD_UPDATES: "household:updates",
    SESSION_INVALIDATIONS: "session:invalidations",
  },
  isRedisAvailable: vi.fn(() => true),
  getRedisError: vi.fn(() => null),
  connectRedis: vi.fn(() => Promise.resolve(true)),
  checkRedisHealth: vi.fn(() =>
    Promise.resolve({ status: "healthy", latency: 1 })
  ),
}));
