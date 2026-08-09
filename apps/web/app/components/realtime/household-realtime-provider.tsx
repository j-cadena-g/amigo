import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useWebSocket } from "@/app/lib/websocket";

type RealtimeHandler = (data: unknown) => void;
type Subscribe = (handler: RealtimeHandler) => () => void;

const HouseholdRealtimeContext = createContext<Subscribe | null>(null);

export function HouseholdRealtimeProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const handlersRef = useRef(new Set<RealtimeHandler>());

  const onMessage = useCallback((data: unknown) => {
    for (const handler of handlersRef.current) {
      handler(data);
    }
  }, []);

  const onSessionInvalidated = useCallback(() => {
    window.location.assign("/");
  }, []);

  useWebSocket({
    userId,
    onMessage,
    onSessionInvalidated,
  });

  const subscribe = useCallback<Subscribe>((handler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return (
    <HouseholdRealtimeContext.Provider value={subscribe}>
      {children}
    </HouseholdRealtimeContext.Provider>
  );
}

export function useHouseholdRealtime(handler: RealtimeHandler): void {
  const subscribe = useContext(HouseholdRealtimeContext);
  if (!subscribe) {
    throw new Error(
      "useHouseholdRealtime must be used within HouseholdRealtimeProvider"
    );
  }

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe((data) => {
      handlerRef.current(data);
    });
  }, [subscribe]);
}
