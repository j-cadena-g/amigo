import { useEffect, useState } from "react";
import { type MetaArgs, redirect, useNavigate } from "react-router";
import { useClerk } from "@clerk/react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Wordmark } from "@/app/components/wordmark";
import { useToast } from "@/app/components/toast-provider";
import { getSessionStatus } from "@/app/lib/session.server";
import { pageTitle, useT } from "@/app/i18n";

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

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.restoreHousehold);
}

export default function RestoreAccount() {
  const t = useT();
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
          toast(t.onboarding.pendingCheckFailed, { variant: "error" });
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
  }, [navigate, toast, t]);

  const handleRestore = async () => {
    setIsLoading("restore");
    try {
      const res = await fetch("/api/restore/restore", { method: "POST" });
      if (res.ok) {
        navigate("/dashboard");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(body?.error ?? t.common.couldNot(t.onboarding.restoreAction), { variant: "error" });
    } catch {
      toast(t.common.couldNotConnection(t.onboarding.restoreAction), { variant: "error" });
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
      toast(body?.error ?? t.common.couldNot(t.onboarding.rejoinAction), { variant: "error" });
    } catch {
      toast(t.common.couldNotConnection(t.onboarding.rejoinAction), { variant: "error" });
    } finally {
      setIsLoading(null);
    }
  };

  if (!checkedPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t.common.loading}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">{t.onboarding.restoreTitle}</h1>
        <p className="mt-2">
          {t.onboarding.noLongerMember(
            householdName ? (
              <span className="font-semibold">{householdName}</span>
            ) : (
              t.onboarding.yourHousehold
            )
          )}
        </p>

        <div className="mt-8 space-y-3">
          <Button
            className="w-full"
            onClick={handleRestore}
            disabled={isLoading !== null}
          >
            {isLoading === "restore" ? t.onboarding.restoring : t.onboarding.restore}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleFreshStart}
            disabled={isLoading !== null}
          >
            {isLoading === "fresh" ? t.onboarding.rejoining : t.onboarding.rejoin}
          </Button>
          <p className="text-sm text-muted-foreground">{t.onboarding.rejoinHint}</p>
        </div>

        <Button
          variant="ghost"
          className="-ml-4 mt-6 self-start"
          onClick={() => void signOut()}
          disabled={isLoading !== null}
        >
          {t.nav.signOut}
        </Button>
      </div>
    </main>
  );
}
