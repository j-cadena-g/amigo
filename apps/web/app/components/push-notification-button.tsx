import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/toast-provider";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermissionStatus,
  isSubscribed,
} from "@/app/lib/push/client";

type Status = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function PushNotificationButton() {
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
      const action = turningOff ? "turn off" : "turn on";
      toast(
        error instanceof Error
          ? `Couldn't ${action} alerts: ${error.message}`
          : `Couldn't ${action} alerts. Try again.`,
        { variant: "error" }
      );
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
      <p
        className="flex h-10 shrink-0 items-center text-sm text-muted-foreground"
        title="Allow notifications for this site in your browser settings"
      >
        Alerts blocked
      </p>
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
      title={
        subscribed
          ? "Turn off grocery list alerts"
          : "Get a notification when the grocery list changes"
      }
    >
      {isToggling
        ? subscribed
          ? "Turning off…"
          : "Turning on…"
        : subscribed
          ? "Alerts on"
          : "Turn on alerts"}
    </Button>
  );
}
