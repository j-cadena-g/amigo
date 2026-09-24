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
        err instanceof Error
          ? `Couldn't turn on notifications: ${err.message}`
          : "Couldn't turn on notifications. Try again."
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
          <DialogTitle className="pr-6">
            Get a notification when the grocery list changes
          </DialogTitle>
          <DialogDescription>
            You&apos;ll get one when someone else in your household adds an item or
            marks one as bought.
          </DialogDescription>
        </DialogHeader>

        {needsIOSInstall && (
          <div className="text-sm">
            <p className="font-semibold">
              On iPhone and iPad, add amigo to your Home Screen first:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
              <li>Tap the Share button in Safari.</li>
              <li>Choose &ldquo;Add to Home Screen&rdquo;.</li>
              <li>Open amigo from your Home Screen and turn on notifications.</li>
            </ol>
          </div>
        )}

        {isDenied && (
          <p className="text-sm">
            Notifications are blocked for amigo in this browser. Allow them in your
            browser&apos;s site settings, then try again.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleSkip}>
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => void handleEnable()}
            disabled={isLoading || isDenied || needsIOSInstall}
          >
            {isLoading ? "Turning on…" : "Turn on notifications"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
