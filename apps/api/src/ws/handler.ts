import type { ServerWebSocket } from "bun";
import { subscriber, CHANNELS, redis } from "../lib/redis";

export interface WebSocketData {
  householdId: string;
  sessionId: string;
}

const clients = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

// Track clients by sessionId for quick invalidation lookup
const clientsBySession = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

// Session revalidation interval (5 minutes)
const SESSION_REVALIDATION_INTERVAL = 5 * 60 * 1000;

export function setupWebSocketHandlers() {
  // Subscribe to Valkey channels for real-time updates
  subscriber.subscribe(CHANNELS.HOUSEHOLD_UPDATES, CHANNELS.SESSION_INVALIDATIONS, (err) => {
    if (err) {
      console.error("Failed to subscribe to channels:", err);
    }
  });

  subscriber.on("message", (channel, message) => {
    if (channel === CHANNELS.HOUSEHOLD_UPDATES) {
      try {
        const payload = JSON.parse(message) as {
          householdId: string;
          type: string;
          data: unknown;
        };
        broadcastToHousehold(payload.householdId, message);
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    } else if (channel === CHANNELS.SESSION_INVALIDATIONS) {
      // Handle session invalidation - close connections for this session
      try {
        const payload = JSON.parse(message) as { sessionId: string };
        invalidateSession(payload.sessionId);
      } catch (error) {
        console.error("Failed to parse session invalidation:", error);
      }
    }
  });

  // Start periodic session revalidation
  setInterval(revalidateAllSessions, SESSION_REVALIDATION_INTERVAL);
}

/**
 * Close all WebSocket connections for an invalidated session
 */
function invalidateSession(sessionId: string) {
  const sessionClients = clientsBySession.get(sessionId);
  if (!sessionClients) return;

  console.log(`Invalidating ${sessionClients.size} WebSocket connection(s) for session: ${sessionId.slice(0, 8)}...`);

  for (const client of sessionClients) {
    client.close(1008, "Session invalidated");
  }
}

/**
 * Periodically revalidate all active sessions
 * Closes connections for sessions that no longer exist in Redis
 */
async function revalidateAllSessions() {
  const sessionsToCheck = Array.from(clientsBySession.keys());
  if (sessionsToCheck.length === 0) return;

  for (const sessionId of sessionsToCheck) {
    const sessionKey = `session:${sessionId}`;
    const exists = await redis.exists(sessionKey);

    if (!exists) {
      invalidateSession(sessionId);
    }
  }
}

export function addClient(ws: ServerWebSocket<WebSocketData>) {
  const { householdId, sessionId } = ws.data;

  // Track by household
  if (!clients.has(householdId)) {
    clients.set(householdId, new Set());
  }
  clients.get(householdId)?.add(ws);

  // Track by session for invalidation
  if (!clientsBySession.has(sessionId)) {
    clientsBySession.set(sessionId, new Set());
  }
  clientsBySession.get(sessionId)?.add(ws);
}

export function removeClient(ws: ServerWebSocket<WebSocketData>) {
  const { householdId, sessionId } = ws.data;

  // Remove from household tracking
  clients.get(householdId)?.delete(ws);
  if (clients.get(householdId)?.size === 0) {
    clients.delete(householdId);
  }

  // Remove from session tracking
  clientsBySession.get(sessionId)?.delete(ws);
  if (clientsBySession.get(sessionId)?.size === 0) {
    clientsBySession.delete(sessionId);
  }
}

function broadcastToHousehold(householdId: string, message: string) {
  const householdClients = clients.get(householdId);
  if (!householdClients) return;

  for (const client of householdClients) {
    client.send(message);
  }
}
