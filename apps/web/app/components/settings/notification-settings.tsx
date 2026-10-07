import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/app/components/ui/switch";
import { Button } from "@/app/components/ui/button";
import {
  getNotificationPermissionStatus,
  getNotificationPreferences,
  isIOS,
  isPWAInstalled,
  isSubscribed,
  pushErrorCode,
  setNotificationCategory,
  subscribeToPush,
  unsubscribeFromPush,
  type NotificationPreferences,
} from "@/app/lib/push/client";
import { useT } from "@/app/i18n";

type Status = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function NotificationSettings() {
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const needsIOSInstall = isIOS() && !isPWAInstalled();

  const refreshStatus = useCallback(async () => {
    setError(null);
    try {
      const permission = getNotificationPermissionStatus();
      const [savedPreferences, subscribed] = await Promise.all([
        getNotificationPreferences(),
        isSubscribed(),
      ]);
      setPreferences(savedPreferences);
      setStatus(
        permission === "unsupported" || permission === "denied"
          ? permission
          : subscribed ? "subscribed" : "unsubscribed"
      );
    } catch (err) {
      setError(t.notifications.updateFailed(t.notifications.reason[pushErrorCode(err)]));
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function handleToggle(category: keyof NotificationPreferences, enabled: boolean) {
    setToggling(true);
    setError(null);
    try {
      const savedPreferences = await setNotificationCategory(category, enabled);
      setPreferences(savedPreferences);
      if (enabled) setStatus("subscribed");
    } catch (err) {
      setError(t.notifications.updateFailed(t.notifications.reason[pushErrorCode(err)]));
      if (getNotificationPermissionStatus() === "denied") setStatus("denied");
    } finally {
      setToggling(false);
    }
  }

  async function enableDevice() {
    setToggling(true);
    setError(null);
    try {
      await subscribeToPush();
      setStatus("subscribed");
    } catch (err) {
      setError(t.notifications.turnOnFailed(t.notifications.reason[pushErrorCode(err)]));
      if (getNotificationPermissionStatus() === "denied") setStatus("denied");
    } finally {
      setToggling(false);
    }
  }

  async function disableDevice() {
    setToggling(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setStatus("unsubscribed");
    } catch (err) {
      setError(t.notifications.updateFailed(t.notifications.reason[pushErrorCode(err)]));
    } finally {
      setToggling(false);
    }
  }

  if (!preferences) {
    return error ? (
      <div className="space-y-3">
        <p className="text-sm text-destructive" role="alert">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatus()}>
          {t.notifications.retry}
        </Button>
      </div>
    ) : <p className="text-sm text-muted-foreground">{t.notifications.checking}</p>;
  }

  const canEnable = status !== "denied" && status !== "unsupported" && !needsIOSInstall;
  const anyEnabled = preferences.groceryNotifications || preferences.recurringNotifications || preferences.transactionNotifications;
  const categories = [
    {
      key: "groceryNotifications" as const,
      id: "grocery-notifications",
      label: t.notifications.groceryChanges,
      hint: t.notifications.groceryChangesHint,
    },
    {
      key: "recurringNotifications" as const,
      id: "recurring-notifications",
      label: t.notifications.recurringExpenses,
      hint: t.notifications.recurringExpensesHint,
    },
    {
      key: "transactionNotifications" as const,
      id: "transaction-notifications",
      label: t.notifications.scheduledTransactions,
      hint: t.notifications.scheduledTransactionsHint,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.notifications.accountPreferencesHint}</p>
      {categories.map(({ key, id, label, hint }) => (
        <div key={key} className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="font-semibold">{label}</label>
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>
          </div>
          <Switch
            id={id}
            aria-describedby={`${id}-hint`}
            checked={preferences[key]}
            disabled={toggling || (!preferences[key] && !canEnable)}
            onCheckedChange={(checked) => void handleToggle(key, checked)}
          />
        </div>
      ))}

      {status === "denied" && (
        <div>
          <p className="font-semibold">{t.notifications.blockedTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.notifications.blockedBody}</p>
        </div>
      )}
      {status === "unsupported" && !needsIOSInstall && (
        <p className="text-sm text-muted-foreground">{t.notifications.unsupported}</p>
      )}
      {canEnable && (
        <div>
          <p className="text-sm text-muted-foreground">
            {status === "subscribed" ? t.notifications.deviceEnabled : t.notifications.deviceDisabled}
          </p>
          {status === "subscribed" && (
            <Button type="button" variant="outline" size="sm" className="mt-3"
              disabled={toggling} onClick={() => void disableDevice()}>
              {t.notifications.disableDevice}
            </Button>
          )}
          {status === "unsubscribed" && anyEnabled && (
            <Button type="button" variant="outline" size="sm" className="mt-3"
              disabled={toggling} onClick={() => void enableDevice()}>
              {toggling ? t.notifications.turningOn : t.notifications.enableDevice}
            </Button>
          )}
        </div>
      )}
      {needsIOSInstall && (
        <div>
          <p className="text-sm">{t.notifications.iosHint}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3"
            aria-expanded={showInstallSteps} onClick={() => setShowInstallSteps(!showInstallSteps)}>
            {t.notifications.showInstallSteps}
          </Button>
          {showInstallSteps && (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
              {t.notifications.iosSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
