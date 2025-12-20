import type { ServerWebSocket } from "bun";
import { subscriber, CHANNELS } from "../lib/redis";

export interface WebSocketData {
  householdId: string;
}

const clients = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

export function setupWebSocketHandlers() {
  // Subscribe to Valkey channels for real-time updates
  subscriber.subscribe(CHANNELS.HOUSEHOLD_UPDATES, (err) => {
    if (err) {
      console.error("Failed to subscribe to channel:", err);
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
    }
  });
}

export function addClient(ws: ServerWebSocket<WebSocketData>) {
  const { householdId } = ws.data;
  if (!clients.has(householdId)) {
    clients.set(householdId, new Set());
  }
  clients.get(householdId)?.add(ws);
}

export function removeClient(ws: ServerWebSocket<WebSocketData>) {
  const { householdId } = ws.data;
  clients.get(householdId)?.delete(ws);
  if (clients.get(householdId)?.size === 0) {
    clients.delete(householdId);
  }
}

function broadcastToHousehold(householdId: string, message: string) {
  const householdClients = clients.get(householdId);
  if (!householdClients) return;

  for (const client of householdClients) {
    client.send(message);
  }
}
