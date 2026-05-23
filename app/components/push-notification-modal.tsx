import { useState } from "react";
import {
  subscribeToPush,
  getNotificationPermissionStatus,
  isIOSSafari,
  isPWAInstalled,
} from "@/app/lib/push/client";

interface PushNotificationModalProps {
  onClose: () => void;
}

export function PushNotificationModal({ onClose }: PushNotificationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIOS = isIOSSafari();
  const isPWA = isPWAInstalled();
  const needsIOSInstall = isIOS && !isPWA;

  async function handleEnable() {
    setIsLoading(true);
    setError(null);

    try {
      await subscribeToPush();
      localStorage.setItem("push-notification-prompted", "true");
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
    localStorage.setItem("push-notification-prompted", "true");
    onClose();
  }

  const permissionStatus = getNotificationPermissionStatus();
  const isDenied = permissionStatus === "denied";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Stay Updated</h2>
        </div>

        <p className="mb-4 text-muted-foreground">
          Get notified when your household member adds items to the grocery list
          or marks items as purchased.
        </p>

        {needsIOSInstall && (
          <div className="mb-4 rounded-md bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
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
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Notifications blocked</p>
            <p className="mt-1">
              You previously blocked notifications. To enable them, update your
              browser settings for this site.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={isLoading || isDenied || needsIOSInstall}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? "Enabling..." : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
