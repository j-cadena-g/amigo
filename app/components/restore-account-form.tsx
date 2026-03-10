import { useState } from "react";
import { useNavigate } from "react-router";
import { useClerk } from "@clerk/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { RotateCcw, Sparkles, LogOut } from "lucide-react";

interface RestoreAccountFormProps {
  token: string;
}

export function RestoreAccountForm({ token }: RestoreAccountFormProps) {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState<"restore" | "fresh" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setLoading("restore");
    setError(null);

    try {
      const res = await fetch("/api/restore/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to restore account");
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  async function handleFreshStart() {
    setLoading("fresh");
    setError(null);

    try {
      const res = await fetch("/api/restore/fresh-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to start fresh");
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("cancel");
    setError(null);

    try {
      await fetch("/api/restore/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      await signOut();
    } catch {
      // Even if cancel fails, sign out
      await signOut();
    }
  }

  const isDisabled = loading !== null;

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <RotateCcw className="h-5 w-5 text-green-700 dark:text-green-300" />
            </div>
            <div>
              <CardTitle className="text-base">Restore My Account</CardTitle>
              <CardDescription>
                Pick up where you left off with all your existing data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleRestore}
            disabled={isDisabled}
            className="w-full"
          >
            {loading === "restore" ? "Restoring..." : "Restore Account"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
              <Sparkles className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <CardTitle className="text-base">Start Fresh</CardTitle>
              <CardDescription>
                Re-join as a member with a clean slate. Your previous data will be
                transferred to the household owner.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleFreshStart}
            disabled={isDisabled}
            variant="secondary"
            className="w-full"
          >
            {loading === "fresh" ? "Starting fresh..." : "Start Fresh"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <LogOut className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Cancel & Sign Out</CardTitle>
              <CardDescription>
                Discard the restore token and sign out.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleCancel}
            disabled={isDisabled}
            variant="outline"
            className="w-full"
          >
            {loading === "cancel" ? "Signing out..." : "Cancel & Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
