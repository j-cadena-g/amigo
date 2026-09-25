import { useEffect, useState } from "react";
import { redirect, useNavigate } from "react-router";
import { useClerk } from "@clerk/react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Wordmark } from "@/app/components/wordmark";
import { useToast } from "@/app/components/toast-provider";
import { getSessionStatus } from "@/app/lib/session.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  if (status === "unauthenticated") {
    throw redirect("/");
  }
  if (status === "authenticated") {
    throw redirect("/dashboard");
  }
  if (status === "needs_setup") {
    throw redirect("/setup");
  }
  if (status !== "revoked") {
    throw redirect("/setup");
  }
  return null;
}

export function meta() {
  return [{ title: "Restore your household · amigo" }];
}

export default function RestoreAccount() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState<"restore" | "fresh" | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [checkedPending, setCheckedPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restore/pending");
        if (!res.ok) {
          throw new Error(`pending-check failed: ${res.status}`);
        }
        const data = (await res.json()) as {
          pending?: boolean;
          householdName?: string;
        };
        if (cancelled) return;
        if (!data.pending) {
          navigate("/setup", { replace: true });
          return;
        }
        setHouseholdName(data.householdName ?? null);
      } catch {
        if (!cancelled) {
          toast(
            "Couldn't check whether your household can be restored. Reload to try again.",
            { variant: "error" }
          );
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
      toast(body?.error ?? "Couldn't restore your access. Try again.", {
        variant: "error",
      });
    } catch {
      toast("Couldn't restore your access. Check your connection and try again.", {
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
      toast(body?.error ?? "Couldn't rejoin the household. Try again.", {
        variant: "error",
      });
    } catch {
      toast("Couldn't rejoin the household. Check your connection and try again.", {
        variant: "error",
      });
    } finally {
      setIsLoading(null);
    }
  };

  if (!checkedPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">Restore your household?</h1>
        <p className="mt-2">
          You&apos;re no longer a member of{" "}
          {householdName ? (
            <span className="font-semibold">{householdName}</span>
          ) : (
            "your household"
          )}
          . For up to 14 days, you can restore your access and keep everything you
          added.
        </p>

        <div className="mt-8 space-y-3">
          <Button
            className="w-full"
            onClick={handleRestore}
            disabled={isLoading !== null}
          >
            {isLoading === "restore" ? "Restoring…" : "Restore household"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleFreshStart}
            disabled={isLoading !== null}
          >
            {isLoading === "fresh" ? "Rejoining…" : "Rejoin as a new member"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Rejoining as a new member hands everything you added to the household
            owner.
          </p>
        </div>

        <Button
          variant="ghost"
          className="-ml-4 mt-6 self-start"
          onClick={() => void signOut()}
          disabled={isLoading !== null}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
