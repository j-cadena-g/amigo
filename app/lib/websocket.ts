import { useEffect, useRef, useCallback, useState } from "react";

export type WebSocketStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void;
  onSessionInvalidated?: () => void;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  pingInterval?: number;
}

/**
 * WebSocket hook connecting to the Durable Object via /ws.
 * - Automatic reconnection with exponential backoff
 * - Ping/pong keepalive (handled by DO's setWebSocketAutoResponse)
 * - Session invalidation handling
 */
export function useWebSocket({
  onMessage,
  onSessionInvalidated,
  maxRetries = 10,
  baseDelay = 1000,
  maxDelay = 30000,
  pingInterval = 30000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");

  const connectRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectRef.current = () => {
      if (!isMountedRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      setStatus("connecting");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        setStatus("connected");
        retryCountRef.current = 0;

        // Send ping to keep connection alive
        // DO auto-responds with pong via setWebSocketAutoResponse
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, pingInterval);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        // Ignore pong (auto-response from DO)
        if (event.data === "pong") return;

        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;

          if (data.type === "SESSION_INVALIDATED") {
            onSessionInvalidated?.();
            return;
          }

          onMessage(data);
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        // Will trigger onclose which handles reconnection
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;

        setStatus("disconnected");
        clearTimers();

        // Don't reconnect if session was invalidated
        if (event.code === 4001) return;

        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(
            baseDelay * Math.pow(2, retryCountRef.current),
            maxDelay
          );
          retryCountRef.current++;

          retryTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectRef.current();
            }
          }, delay);
        }
      };
    };
  }, [onMessage, onSessionInvalidated, maxRetries, baseDelay, maxDelay, pingInterval, clearTimers]);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearTimers]);

  useEffect(() => {
    isMountedRef.current = true;

    // Small delay to avoid rapid connect/disconnect in React Strict Mode
    const connectTimeout = setTimeout(() => connectRef.current(), 100);

    return () => {
      isMountedRef.current = false;
      clearTimeout(connectTimeout);
      disconnect();
    };
  }, [disconnect]);

  return { status, disconnect };
}
