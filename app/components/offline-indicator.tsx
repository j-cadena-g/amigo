import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { getPendingCount, isOfflineSupported } from "@/app/lib/offline";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
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

    const handleOnline = () => {
      setIsOnline(true);
      void refreshPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
      void refreshPending();
    };

    void refreshPending();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = window.setInterval(() => void refreshPending(), 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  if (isOnline && pendingCount === 0) return null;

  const label = isOnline
    ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending sync`
    : pendingCount > 0
      ? `Offline — ${pendingCount} change${pendingCount === 1 ? "" : "s"} pending`
      : "You're offline";

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2 rounded-lg bg-yellow-500/90 px-4 py-2 text-sm font-medium text-black shadow-lg">
      <WifiOff className="h-4 w-4" />
      {label}
    </div>
  );
}
