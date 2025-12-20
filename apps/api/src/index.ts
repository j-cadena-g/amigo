import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRouter } from "./routes/health";
import { transactionsRouter } from "./routes/transactions";
import { groceriesRouter } from "./routes/groceries";
import { setupWebSocketHandlers } from "./ws/handler";
import type { WebSocketData } from "./ws/handler";
import type { ServerWebSocket } from "bun";

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

// Track connected clients
const clients = new Set<ServerWebSocket<WebSocketData>>();

setupWebSocketHandlers();

Bun.serve<WebSocketData>({
  port: Number(port),
  fetch: app.fetch,
  websocket: {
    open(ws) {
      console.log("WebSocket connected");
      clients.add(ws);
    },
    message(ws, message) {
      console.log("WebSocket message:", message);
    },
    close(ws) {
      console.log("WebSocket disconnected");
      clients.delete(ws);
    },
  },
});

console.log(`API server running on port ${port}`);
