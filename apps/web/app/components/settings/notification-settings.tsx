import { useEffect, useState } from "react";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import { usePushPrompt } from "@/app/components/push-prompt-provider";
import {
  getNotificationPermissionStatus,
  isIOS,
  isPWAInstalled,
  isSubscribed,
  pushErrorCode,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/app/lib/push/client";
import { useT } from "@/app/i18n";

type Status = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function NotificationSettings() {
  const t = useT();
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
      setError(t.notifications.updateFailed(t.notifications.reason[pushErrorCode(err)]));
      await refreshStatus();
    } finally {
      setToggling(false);
    }
  }

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">{t.notifications.checking}</p>
    );
  }

  if (status === "unsupported" && !needsIOSInstall) {
    return (
      <p className="text-muted-foreground">{t.notifications.unsupported}</p>
    );
  }

  if (status === "denied") {
    return (
      <div>
        <p className="font-semibold">{t.notifications.blockedTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.notifications.blockedBody}</p>
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
              {t.notifications.groceryChanges}
            </label>
            <p
              id="grocery-notifications-hint"
              className="text-sm text-muted-foreground"
            >
              {t.notifications.groceryChangesHint}
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
          <p className="text-sm">{t.notifications.iosHint}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => showPrompt()}
          >
            {t.notifications.showInstallSteps}
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
