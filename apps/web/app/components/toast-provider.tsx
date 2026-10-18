import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastVariant = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  /** Accessible name when the label alone is ambiguous, e.g. "Undo deleting Milk". */
  ariaLabel?: string;
  onClick: () => void;
}

export interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  duration?: number;
  /** A button next to the message. Clicking it runs the action and dismisses the toast. */
  action?: ToastAction;
}

export type ToastFn = (message: string, options?: ToastOptions) => void;

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "bg-foreground text-background",
  success: "bg-success text-success-foreground",
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

      setToasts((prev) => [...prev, { id, message, variant, action: options?.action }]);

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
        className="pointer-events-none fixed inset-x-0 bottom-(--toast-bottom) z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastView({
  toast: t,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const shape = `pointer-events-auto max-w-sm animate-appear rounded-lg text-sm font-semibold shadow-lg ${VARIANT_STYLES[t.variant]}`;

  if (!t.action) {
    return (
      <button type="button" onClick={onDismiss} className={`${shape} px-4 py-2.5`}>
        {t.message}
      </button>
    );
  }

  const action = t.action;
  return (
    <div className={`${shape} flex items-center gap-1 py-1 pl-4 pr-1`}>
      <span className="py-1.5">{t.message}</span>
      <button
        type="button"
        onClick={() => {
          action.onClick();
          onDismiss();
        }}
        aria-label={action.ariaLabel}
        className="min-h-11 rounded-md px-3 underline underline-offset-4 pointer-fine:min-h-0 pointer-fine:py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        {action.label}
      </button>
    </div>
  );
}
