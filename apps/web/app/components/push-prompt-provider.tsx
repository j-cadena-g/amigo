import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import { PushNotificationModal } from "./push-notification-modal";
import {
  getNotificationPermissionStatus,
  hasPushRegistration,
  isSubscribed,
} from "@/app/lib/push/client";
import { PUSH_PROMPT_STORAGE_KEY } from "@/app/lib/push/constants";

const PROMPT_DELAY_MS = 2000;

interface PushPromptContextValue {
  showPrompt: () => void;
}

const PushPromptContext = createContext<PushPromptContextValue | null>(null);

/** Alerts are about the grocery list, so the automatic prompt only appears there. */
export function isPushPromptPath(pathname: string): boolean {
  return pathname === "/groceries" || pathname.startsWith("/groceries/");
}

function clearPushPromptedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PUSH_PROMPT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode, quota, etc.)
  }
}

export function usePushPrompt(): PushPromptContextValue {
  const context = useContext(PushPromptContext);
  if (!context) {
    throw new Error("usePushPrompt must be used within PushPromptProvider");
  }
  return context;
}

interface PushPromptProviderProps {
  children: ReactNode;
}

export function PushPromptProvider({ children }: PushPromptProviderProps) {
  const [showModal, setShowModal] = useState(false);
  const { pathname } = useLocation();
  const onPromptPath = isPushPromptPath(pathname);
  // Once per app session, even when storage is unavailable to remember a dismissal.
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (!onPromptPath || autoPromptedRef.current) return;

    async function checkShouldPrompt(): Promise<boolean> {
      if (typeof window === "undefined") return false;

      try {
        if (localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === "true") {
          return false;
        }
      } catch {
        // Storage unavailable; continue with prompt eligibility checks.
      }

      const permission = getNotificationPermissionStatus();
      if (permission === "unsupported" || permission === "denied") {
        return false;
      }

      if (!(await hasPushRegistration())) {
        return false;
      }

      if (permission === "granted") {
        const subscribed = await isSubscribed();
        if (subscribed) {
          return false;
        }
      }

      return true;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void checkShouldPrompt().then((shouldPrompt) => {
        if (cancelled || !shouldPrompt) return;
        autoPromptedRef.current = true;
        setShowModal(true);
      });
    }, PROMPT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onPromptPath]);

  return (
    <PushPromptContext.Provider
      value={{
        showPrompt: () => {
          clearPushPromptedFlag();
          setShowModal(true);
        },
      }}
    >
      {children}
      {showModal && (
        <PushNotificationModal onClose={() => setShowModal(false)} />
      )}
    </PushPromptContext.Provider>
  );
}
