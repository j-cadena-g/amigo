import { useEffect, useRef, useCallback, useState } from "react";

export type WebSocketStatus = "connecting" | "connected" | "disconnected";

/** Close code used when the Durable Object invalidates a user's session. */
export const SESSION_INVALIDATED_CLOSE_CODE = 4001;

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void;
  onSessionInvalidated?: () => void;
  userId?: string | null;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  pingInterval?: number;
}

export function buildWebSocketUrl(
  currentUrl: string,
  userId?: string | null
): string {
  const url = new URL(currentUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";

  if (userId) {
    url.searchParams.set("userId", userId);
  }

  return url.toString();
}

export function computeReconnectDelay(
  retryCount: number,
  baseDelay: number,
  maxDelay: number
): number {
  return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
}

/** Whether onclose should schedule another exponential-backoff retry. */
export function shouldScheduleBackoffReconnect(
  closeCode: number,
  retryCount: number,
  maxRetries: number
): boolean {
  if (closeCode === SESSION_INVALIDATED_CLOSE_CODE) return false;
  return retryCount < maxRetries;
}

/** Whether a visibilitychange should resume a stopped reconnect budget. */
export function shouldResumeOnVisibility(
  visibilityState: string,
  status: WebSocketStatus
): boolean {
  return visibilityState === "visible" && status === "disconnected";
}

/** Online / resume must not tear down keepalive on an already-open socket. */
export function shouldResumeWhileDisconnected(status: WebSocketStatus): boolean {
  return status === "disconnected";
}

/**
 * WebSocket hook connecting to the Durable Object via /ws.
 * - Automatic reconnection with exponential backoff
 * - Resume on `online` / tab visible after the backoff budget is exhausted
 * - Ping/pong keepalive (handled by DO's setWebSocketAutoResponse)
 * - Session invalidation handling (close code 4001 — no reconnect)
 */
export function useWebSocket({
  onMessage,
  onSessionInvalidated,
  userId,
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
  const permanentlyClosedRef = useRef(false);
  const statusRef = useRef<WebSocketStatus>("disconnected");
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");

  const connectRef = useRef<() => void>(() => {});

  const updateStatus = useCallback((next: WebSocketStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

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

  const invalidateSession = useCallback(() => {
    if (permanentlyClosedRef.current) return;
    permanentlyClosedRef.current = true;
    clearTimers();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    updateStatus("disconnected");
    onSessionInvalidated?.();
  }, [clearTimers, onSessionInvalidated, updateStatus]);

  useEffect(() => {
    connectRef.current = () => {
      if (!isMountedRef.current || permanentlyClosedRef.current) return;

      const readyState = wsRef.current?.readyState;
      if (
        readyState === WebSocket.OPEN ||
        readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      const wsUrl = buildWebSocketUrl(window.location.href, userId);

      updateStatus("connecting");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        updateStatus("connected");
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
          const data = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;

          if (data.type === "SESSION_INVALIDATED") {
            invalidateSession();
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

        updateStatus("disconnected");
        clearTimers();

        if (event.code === SESSION_INVALIDATED_CLOSE_CODE) {
          invalidateSession();
          return;
        }

        if (
          shouldScheduleBackoffReconnect(
            event.code,
            retryCountRef.current,
            maxRetries
          )
        ) {
          const delay = computeReconnectDelay(
            retryCountRef.current,
            baseDelay,
            maxDelay
          );
          retryCountRef.current++;

          retryTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectRef.current();
            }
          }, delay);
        }
        // When retryCount hits maxRetries, stop scheduling backoff timers but
        // still allow resume via online / visibility listeners below.
      };
    };
  }, [
    onMessage,
    invalidateSession,
    userId,
    maxRetries,
    baseDelay,
    maxDelay,
    pingInterval,
    clearTimers,
    updateStatus,
  ]);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      // Drop handlers so intentional close does not schedule reconnect.
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    updateStatus("disconnected");
  }, [clearTimers, updateStatus]);

  const resume = useCallback(() => {
    if (!isMountedRef.current || permanentlyClosedRef.current) return;
    if (!shouldResumeWhileDisconnected(statusRef.current)) return;
    retryCountRef.current = 0;
    clearTimers();
    connectRef.current();
  }, [clearTimers]);

  useEffect(() => {
    const onOnline = () => {
      resume();
    };

    const onVisibilityChange = () => {
      if (
        shouldResumeOnVisibility(
          document.visibilityState,
          statusRef.current
        )
      ) {
        resume();
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [resume]);

  useEffect(() => {
    isMountedRef.current = true;
    permanentlyClosedRef.current = false;

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
