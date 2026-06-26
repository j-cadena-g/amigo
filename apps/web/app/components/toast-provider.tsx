import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastVariant = "default" | "success" | "error";

export interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  duration?: number;
}

export type ToastFn = (message: string, options?: ToastOptions) => void;

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "bg-foreground text-background",
  success:
    "bg-green-600 text-white dark:bg-green-500 dark:text-black",
  error: "bg-destructive text-destructive-foreground",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastFn>(
    (message, options) => {
      const id = crypto.randomUUID();
      const variant = options?.variant ?? "default";
      const duration = options?.duration ?? 4000;

      setToasts((prev) => [...prev, { id, message, variant }]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto max-w-sm animate-fade-in rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${VARIANT_STYLES[t.variant]}`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
