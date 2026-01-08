"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type WebSocketStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketOptions {
  /** URL path for WebSocket (e.g., "/ws") */
  url: string;
  /** Callback when a message is received */
  onMessage: (data: unknown) => void;
  /** Maximum reconnection attempts (default: 10) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Ping interval in ms to keep connection alive (default: 30000) */
  pingInterval?: number;
}

/**
 * WebSocket hook with:
 * - Automatic reconnection with exponential backoff
 * - Ping/pong keepalive
 * - Connection status tracking
 */
export function useWebSocket({
  url,
  onMessage,
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

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Construct full WebSocket URL from current page location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const fullWsUrl = `${protocol}//${window.location.host}${url}`;

    setStatus("connecting");

    const ws = new WebSocket(fullWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      setStatus("connected");
      retryCountRef.current = 0;

      // Start ping interval to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, pingInterval);
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        // Ignore pong responses
        if (data.type === "pong") return;
        onMessage(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      // Error will trigger onclose, which handles reconnection
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;

      setStatus("disconnected");
      clearTimers();

      // Attempt reconnection with exponential backoff
      if (retryCountRef.current < maxRetries) {
        const delay = Math.min(
          baseDelay * Math.pow(2, retryCountRef.current),
          maxDelay
        );
        retryCountRef.current++;

        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, delay);
      }
    };
  }, [url, onMessage, maxRetries, baseDelay, maxDelay, pingInterval, clearTimers]);

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
    const connectTimeout = setTimeout(connect, 100);

    return () => {
      isMountedRef.current = false;
      clearTimeout(connectTimeout);
      disconnect();
    };
  }, [connect, disconnect]);

  return { status, disconnect };
}
