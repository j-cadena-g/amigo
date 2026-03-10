import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

interface WebSocketAttachment {
  userId: string | null;
  connectedAt: number;
}

export class HouseholdDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      const userId = url.searchParams.get("userId");
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ userId, connectedAt: Date.now() } satisfies WebSocketAttachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast") {
      const payload = await request.json() as Record<string, unknown>;
      const senderId = url.searchParams.get("senderId");
      const message = JSON.stringify(payload);

      for (const ws of this.ctx.getWebSockets()) {
        // Skip sending to the user who triggered the broadcast
        if (senderId) {
          const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
          if (attachment?.userId === senderId) continue;
        }
        ws.send(message);
      }
      return new Response("ok");
    }

    if (url.pathname === "/invalidate") {
      // Force disconnect a specific user (role change, removal)
      const targetUserId = url.searchParams.get("userId");
      const message = JSON.stringify({ type: "SESSION_INVALIDATED" });

      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
        if (attachment?.userId === targetUserId) {
          ws.send(message);
          ws.close(4001, "Session invalidated");
        }
      }
      return new Response("ok");
    }

    if (url.pathname === "/connections") {
      const count = this.ctx.getWebSockets().length;
      return Response.json({ connections: count });
    }

    return new Response("not found", { status: 404 });
  }

  override async webSocketMessage(
    _ws: WebSocket,
    _message: string | ArrayBuffer
  ): Promise<void> {
    // Ping/pong handled by setWebSocketAutoResponse
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string
  ): Promise<void> {
    ws.close(code, reason);
  }

  override async webSocketError(
    ws: WebSocket,
    _error: unknown
  ): Promise<void> {
    ws.close(1011, "Unexpected error");
  }
}
