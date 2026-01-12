import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRouter } from "./routes/health";
import { transactionsRouter } from "./routes/transactions";
import { groceriesRouter } from "./routes/groceries";
import { openAPISpec } from "./lib/openapi-spec";
import {
  setupWebSocketHandlers,
  addClient,
  removeClient,
} from "./ws/handler";
import type { WebSocketData } from "./ws/handler";
import { getSessionFromCookie } from "./lib/session";
import { rateLimit } from "./lib/rate-limit";

// CORS origins from env or defaults based on NODE_ENV
const defaultOrigins =
  process.env["NODE_ENV"] === "production"
    ? ["https://amigo.cadenalabs.net"]
    : ["https://amigo.cadenalabs.net", "https://dev-amigo.cadenalabs.net"];
const corsOrigins = process.env["CORS_ORIGINS"]
  ? process.env["CORS_ORIGINS"].split(",").map((o) => o.trim())
  : defaultOrigins;

const app = new Hono()
  .use("*", logger())
  .use(
    "*",
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  )
  .use(
    "*",
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100, // 100 requests per minute per IP
      keyPrefix: "api:rl",
    })
  )
  .route("/api/health", healthRouter)
  .route("/api/transactions", transactionsRouter)
  .route("/api/groceries", groceriesRouter);

// OpenAPI JSON specification endpoint
app.get("/api/doc", (c) => c.json(openAPISpec));

// Swagger UI documentation endpoint
app.get("/api/docs", swaggerUI({ url: "/api/doc" }));

// Export type for RPC client
export type AppType = typeof app;

// Bun server with WebSocket support
const port = process.env["PORT"] ?? 3001;

setupWebSocketHandlers();

const server = Bun.serve<WebSocketData>({
  port: Number(port),
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade requests
    if (url.pathname === "/ws") {
      const cookieHeader = req.headers.get("cookie");
      const session = await getSessionFromCookie(cookieHeader);

      if (!session) {
        return new Response("Unauthorized", { status: 401 });
      }

      const success = server.upgrade(req, {
        data: {
          householdId: session.householdId,
        },
      });

      if (success) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle regular HTTP requests via Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    open(ws) {
      console.log(
        `WebSocket connected for household: ${ws.data.householdId}`
      );
      addClient(ws);
    },
    message(ws, message) {
      // Handle ping/pong for keepalive
      try {
        const data = JSON.parse(String(message));
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {
        // Ignore non-JSON messages
      }
    },
    close(ws) {
      console.log(
        `WebSocket disconnected for household: ${ws.data.householdId}`
      );
      removeClient(ws);
    },
  },
});

console.log(`API server running on port ${server.port}`);
