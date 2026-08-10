import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { usePushPrompt } from "@/app/components/push-prompt-provider";
import {
  getNotificationPermissionStatus,
  isIOS,
  isPWAInstalled,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/app/lib/push/client";

type Status = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function NotificationSettings() {
  const { showPrompt } = usePushPrompt();
  const [status, setStatus] = useState<Status>("loading");
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsIOSInstall = isIOS() && !isPWAInstalled();

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    const permission = getNotificationPermissionStatus();
    if (permission === "unsupported") {
      setStatus("unsupported");
      return;
    }
    if (permission === "denied") {
      setStatus("denied");
      return;
    }
    const subscribed = await isSubscribed();
    setStatus(subscribed ? "subscribed" : "unsubscribed");
  }

  async function handleToggle(nextChecked: boolean) {
    setToggling(true);
    setError(null);
    try {
      if (nextChecked) {
        if (needsIOSInstall) {
          showPrompt();
          return;
        }
        await subscribeToPush();
        setStatus("subscribed");
      } else {
        await unsubscribeFromPush();
        setStatus("unsubscribed");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update notifications"
      );
      await refreshStatus();
    } finally {
      setToggling(false);
    }
  }

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Checking notification status…</p>
    );
  }

  if (status === "unsupported" && !needsIOSInstall) {
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Notifications blocked</p>
            <p className="text-sm text-muted-foreground">
              Your browser blocked notifications for this site. Update site
              permissions in browser settings to re-enable them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const enabled = status === "subscribed";
  const showToggle = status === "subscribed" || status === "unsubscribed";

  return (
    <div className="space-y-4">
      {showToggle ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {enabled ? (
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">Grocery updates</p>
              <p className="text-sm text-muted-foreground">
                Notify when household members add items or mark them purchased.
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={toggling || needsIOSInstall}
            onCheckedChange={(checked) => void handleToggle(checked)}
            aria-label="Toggle grocery push notifications"
          />
        </div>
      ) : null}

      {needsIOSInstall && (
        <div className="rounded-md bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <p className="font-medium">iOS requires Home Screen install</p>
          <p className="mt-1">
            Add amigo to your Home Screen, open it from there, then enable
            notifications.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => showPrompt()}
          >
            Show install steps
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
