import { useEffect, useState } from "react";
import { redirect, useNavigate } from "react-router";
import { useClerk } from "@clerk/react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/toast-provider";
import { RotateCcw, Sparkles, LogOut } from "lucide-react";
import { getSessionStatus } from "@/app/lib/session.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  if (status === "unauthenticated") {
    throw redirect("/");
  }
  if (status === "authenticated") {
    throw redirect("/dashboard");
  }
  if (status !== "revoked") {
    throw redirect("/no-access");
  }
  return null;
}

export default function RestoreAccount() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [checkedPending, setCheckedPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restore/pending");
        const data = (await res.json()) as {
          pending?: boolean;
          householdName?: string;
        };
        if (cancelled) return;
        if (!data.pending) {
          navigate("/no-access", { replace: true });
          return;
        }
        setHouseholdName(data.householdName ?? null);
      } catch {
        if (!cancelled) {
          toast("Couldn't check restore status", { variant: "error" });
        }
      } finally {
        if (!cancelled) {
          setCheckedPending(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  const handleRestore = async () => {
    setIsLoading("restore");
    try {
      const res = await fetch("/api/restore/restore", { method: "POST" });
      if (res.ok) {
        navigate("/dashboard");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(body?.error ?? "Failed to restore account", { variant: "error" });
    } catch {
      toast("Failed to restore account — check your connection", {
        variant: "error",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handleFreshStart = async () => {
    setIsLoading("fresh");
    try {
      const res = await fetch("/api/restore/fresh-start", { method: "POST" });
      if (res.ok) {
        navigate("/dashboard");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(body?.error ?? "Failed to start fresh", { variant: "error" });
    } catch {
      toast("Failed to start fresh — check your connection", { variant: "error" });
    } finally {
      setIsLoading(null);
    }
  };

  if (!checkedPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome Back</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Your account was previously deactivated
            {householdName ? ` from ${householdName}` : ""}. Choose how you&apos;d
            like to proceed.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start gap-3"
            variant="default"
            onClick={handleRestore}
            disabled={isLoading !== null}
          >
            <RotateCcw className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Restore My Account</p>
              <p className="text-xs opacity-80">
                Reconnect to your previous household and data
              </p>
            </div>
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="outline"
            onClick={handleFreshStart}
            disabled={isLoading !== null}
          >
            <Sparkles className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Start Fresh</p>
              <p className="text-xs text-muted-foreground">
                Create a new household. Your old data transfers to the owner.
              </p>
            </div>
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="ghost"
            onClick={() => void signOut()}
            disabled={isLoading !== null}
          >
            <LogOut className="h-4 w-4" />
            Cancel &amp; Sign Out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
