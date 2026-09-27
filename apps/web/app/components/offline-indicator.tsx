import { useState, useEffect, useSyncExternalStore } from "react";
import { getPendingCount, isOfflineSupported } from "@/app/lib/offline";
import { useT } from "@/app/i18n";

function subscribeOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export function OfflineIndicator() {
  const t = useT();
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineSnapshot,
    getServerOnlineSnapshot
  );
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const refreshPending = async () => {
      if (!(await isOfflineSupported())) return;
      try {
        setPendingCount(await getPendingCount());
      } catch {
        setPendingCount(0);
      }
    };

    const handleOnlineStatusChange = () => {
      void refreshPending();
    };

    void refreshPending();
    window.addEventListener("online", handleOnlineStatusChange);
    window.addEventListener("offline", handleOnlineStatusChange);
    const interval = window.setInterval(() => void refreshPending(), 5000);

    return () => {
      window.removeEventListener("online", handleOnlineStatusChange);
      window.removeEventListener("offline", handleOnlineStatusChange);
      window.clearInterval(interval);
    };
  }, []);

  if (isOnline && pendingCount === 0) return null;

  const label = isOnline
    ? t.common.pendingSync(pendingCount)
    : pendingCount > 0
      ? t.common.offlinePending(pendingCount)
      : t.common.offline;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-(--toast-bottom) left-4 z-50 rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background shadow-lg"
    >
      {label}
    </div>
  );
}
