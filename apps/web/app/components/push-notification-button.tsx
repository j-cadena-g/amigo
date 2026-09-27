import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/toast-provider";
import {
  getNotificationPermissionStatus,
  isSubscribed,
  pushErrorCode,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/app/lib/push/client";
import { useT } from "@/app/i18n";

type Status = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function PushNotificationButton() {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    void checkStatus();
  }, []);

  async function checkStatus() {
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

  async function handleToggle() {
    const turningOff = status === "subscribed";
    setIsToggling(true);
    try {
      if (turningOff) {
        await unsubscribeFromPush();
        setStatus("unsubscribed");
      } else {
        await subscribeToPush();
        setStatus("subscribed");
      }
    } catch (error) {
      console.error("Failed to toggle notifications:", error);
      toast(t.notifications.alertsFailed(turningOff, t.notifications.reason[pushErrorCode(error)]), {
        variant: "error",
      });
      await checkStatus();
    } finally {
      setIsToggling(false);
    }
  }

  if (status === "loading" || status === "unsupported") {
    return null;
  }

  if (status === "denied") {
    return (
      <p className="max-w-56 shrink-0 text-sm text-muted-foreground">{t.notifications.alertsBlocked}</p>
    );
  }

  const subscribed = status === "subscribed";

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handleToggle()}
      disabled={isToggling}
      className="shrink-0"
      title={subscribed ? t.notifications.alertsOffTitle : t.notifications.promptTitle}
    >
      {isToggling
        ? subscribed
          ? t.notifications.turningOff
          : t.notifications.turningOn
        : subscribed
          ? t.notifications.alertsOn
          : t.notifications.turnOnAlerts}
    </Button>
  );
}
