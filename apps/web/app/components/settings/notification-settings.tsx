import { useEffect, useState } from "react";
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
        err instanceof Error
          ? `Couldn't update notifications: ${err.message}`
          : "Couldn't update notifications. Try again."
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
      <p className="text-muted-foreground">
        This browser doesn&apos;t support notifications.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <div>
        <p className="font-semibold">Notifications are blocked</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your browser blocked notifications for amigo. Allow them in your
          browser&apos;s site settings to turn them back on.
        </p>
      </div>
    );
  }

  const enabled = status === "subscribed";
  const showToggle = status === "subscribed" || status === "unsubscribed";

  return (
    <div className="space-y-4">
      {showToggle ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="grocery-notifications" className="font-semibold">
              Grocery list changes
            </label>
            <p
              id="grocery-notifications-hint"
              className="text-sm text-muted-foreground"
            >
              Get a notification when someone else adds an item or marks one as
              bought.
            </p>
          </div>
          <Switch
            id="grocery-notifications"
            aria-describedby="grocery-notifications-hint"
            checked={enabled}
            disabled={toggling || needsIOSInstall}
            onCheckedChange={(checked) => void handleToggle(checked)}
          />
        </div>
      ) : null}

      {needsIOSInstall && (
        <div>
          <p className="text-sm">
            On iPhone and iPad, notifications only work after you add amigo to your
            Home Screen and open it from there.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
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
