import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRouter } from "./routes/health";
import { transactionsRouter } from "./routes/transactions";
import { groceriesRouter } from "./routes/groceries";
import {
  setupWebSocketHandlers,
  addClient,
  removeClient,
} from "./ws/handler";
import type { WebSocketData } from "./ws/handler";
import { getSessionFromCookie } from "./lib/session";

const app = new Hono()
  .use("*", logger())
  .use(
    "*",
    cors({
      origin: [
        "http://192.168.15.32:3000",
        "http://dev-docker-1.cadenalabs.net:3000",
        "https://amigo.cadenalabs.net",
        "https://dev-amigo.cadenalabs.net",
      ],
      credentials: true,
    })
  )
  .route("/api/health", healthRouter)
  .route("/api/transactions", transactionsRouter)
  .route("/api/groceries", groceriesRouter);

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
      console.log("WebSocket message:", message);
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
