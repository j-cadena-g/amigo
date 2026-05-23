import {
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { PushNotificationModal } from "./push-notification-modal";
import {
  getNotificationPermissionStatus,
  isSubscribed,
} from "@/app/lib/push/client";

interface PushPromptContextValue {
  showPrompt: () => void;
}

const PUSH_PROMPT_STORAGE_KEY = "push-notification-prompted";

const PushPromptContext = createContext<PushPromptContextValue | null>(null);

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

  useEffect(() => {
    async function checkShouldPrompt(): Promise<boolean> {
      if (typeof window === "undefined") return false;

      if (localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === "true") {
        return false;
      }

      const permission = getNotificationPermissionStatus();
      if (permission === "unsupported" || permission === "denied") {
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

    const timer = setTimeout(() => {
      void checkShouldPrompt().then((shouldPrompt) => {
        if (shouldPrompt) {
          setShowModal(true);
        }
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

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
