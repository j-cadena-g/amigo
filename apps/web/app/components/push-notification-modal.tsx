import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import {
  getNotificationPermissionStatus,
  isIOS,
  isPWAInstalled,
  pushErrorCode,
  setNotificationCategory,
} from "@/app/lib/push/client";
import { PUSH_PROMPT_STORAGE_KEY } from "@/app/lib/push/constants";
import { useT } from "@/app/i18n";

interface PushNotificationModalProps {
  onClose: () => void;
}

export function PushNotificationModal({ onClose }: PushNotificationModalProps) {
  const t = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIOSDevice = isIOS();
  const isPWA = isPWAInstalled();
  const needsIOSInstall = isIOSDevice && !isPWA;

  async function handleEnable() {
    setIsLoading(true);
    setError(null);

    try {
      await setNotificationCategory("groceryNotifications", true);
      try {
        localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "true");
      } catch (storageErr) {
        console.warn("Failed to persist push prompt state:", storageErr);
      }
      onClose();
    } catch (err) {
      setError(t.notifications.turnOnFailed(t.notifications.reason[pushErrorCode(err)]));
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    try {
      localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "true");
    } catch (storageErr) {
      console.warn("Failed to persist push prompt state:", storageErr);
    }
    onClose();
  }

  const permissionStatus = getNotificationPermissionStatus();
  const isDenied = permissionStatus === "denied";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleSkip();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-6">{t.notifications.promptTitle}</DialogTitle>
          <DialogDescription>{t.notifications.promptBody}</DialogDescription>
        </DialogHeader>

        {needsIOSInstall && (
          <div className="text-sm">
            <p className="font-semibold">{t.notifications.iosTitle}</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
              {t.notifications.iosSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {isDenied && (
          <p className="text-sm">{t.notifications.promptDenied}</p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleSkip}>
            {t.notifications.notNow}
          </Button>
          <Button
            type="button"
            onClick={() => void handleEnable()}
            disabled={isLoading || isDenied || needsIOSInstall}
          >
            {isLoading ? t.notifications.turningOn : t.notifications.turnOn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
