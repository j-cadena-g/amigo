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
  subscribeToPush,
  getNotificationPermissionStatus,
  isIOS,
  isPWAInstalled,
} from "@/app/lib/push/client";
import { PUSH_PROMPT_STORAGE_KEY } from "@/app/lib/push/constants";

interface PushNotificationModalProps {
  onClose: () => void;
}

export function PushNotificationModal({ onClose }: PushNotificationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIOSDevice = isIOS();
  const isPWA = isPWAInstalled();
  const needsIOSInstall = isIOSDevice && !isPWA;

  async function handleEnable() {
    setIsLoading(true);
    setError(null);

    try {
      await subscribeToPush();
      try {
        localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "true");
      } catch (storageErr) {
        console.warn("Failed to persist push prompt state:", storageErr);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to enable notifications"
      );
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
          <DialogTitle>Stay updated</DialogTitle>
          <DialogDescription>
            Get notified when your household member adds items to the grocery
            list or marks items as purchased.
          </DialogDescription>
        </DialogHeader>

        {needsIOSInstall && (
          <div className="rounded-md bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <p className="font-medium">iOS requires app installation</p>
            <p className="mt-1">
              To receive notifications, first add amigo to your Home Screen:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Tap the Share button in Safari</li>
              <li>Select &quot;Add to Home Screen&quot;</li>
              <li>Open the app from your Home Screen</li>
            </ol>
          </div>
        )}

        {isDenied && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Notifications blocked</p>
            <p className="mt-1">
              You previously blocked notifications. To enable them, update your
              browser settings for this site.
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <DialogFooter className="sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleSkip}>
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => void handleEnable()}
            disabled={isLoading || isDenied || needsIOSInstall}
          >
            {isLoading ? "Enabling…" : "Enable notifications"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
