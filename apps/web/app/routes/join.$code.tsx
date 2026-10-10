import { useEffect, useState } from "react";
import { SignIn, useAuth, useClerk } from "@clerk/react-router";
import { type LoaderFunctionArgs, type MetaArgs, redirect, useLoaderData, useNavigate } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Wordmark } from "@/app/components/wordmark";
import { acceptInvite } from "@/app/lib/accept-invite";
import { getSessionStatus } from "@/app/lib/session.server";
import { pageTitle, useT } from "@/app/i18n";

export function loader({ context, params }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  const code = params.code ?? "";

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return { status, code };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.joinHousehold);
}

function JoinLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">{t.nav.joinHousehold}</h1>
        {children}
      </div>
    </main>
  );
}

export default function JoinInvite() {
  const t = useT();
  const { status, code } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [error, setError] = useState<string | null>(
    status === "needs_setup" && !code ? t.onboarding.missingCode : null
  );
  const [accepting, setAccepting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status !== "needs_setup") {
      return;
    }

    if (!code) {
      setError(t.onboarding.missingCode);
      setAccepting(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setAccepting(true);
      setError(null);
      const result = await acceptInvite(code, getToken);
      if (cancelled) return;

      if (result.ok) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setError(result.error ?? (result.network ? t.onboarding.networkError : t.onboarding.acceptFailed));
      setAccepting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, code, getToken, navigate, retryCount, t]);

  if (status === "unauthenticated") {
    const returnTo = `/join/${encodeURIComponent(code)}`;
    return (
      <JoinLayout>
        <p className="mt-2 text-muted-foreground">{t.onboarding.signInToAccept}</p>
        <div className="mt-8">
          <SignIn
            routing="hash"
            forceRedirectUrl={returnTo}
            signUpForceRedirectUrl={returnTo}
          />
        </div>
      </JoinLayout>
    );
  }

  if (status === "authenticated") {
    return (
      <JoinLayout>
        <p className="mt-2">{t.onboarding.alreadyInHousehold}</p>
        <div className="mt-6 space-y-3">
          <Button className="w-full" onClick={() => navigate("/dashboard")}>
            {t.onboarding.goToHousehold}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              void signOut({ redirectUrl: `/join/${encodeURIComponent(code)}` })
            }
          >
            {t.onboarding.useDifferentAccount}
          </Button>
        </div>
      </JoinLayout>
    );
  }

  return (
    <JoinLayout>
      {error ? (
        <>
          <p className="mt-2 text-destructive" role="alert">
            {error}
          </p>
          {error !== t.onboarding.missingCode && (
            <p className="mt-2 text-sm text-muted-foreground">{t.onboarding.askForNew}</p>
          )}
          <div className="mt-6 space-y-3">
            <Button
              className="w-full"
              disabled={accepting}
              onClick={() => setRetryCount((count) => count + 1)}
            >
              {t.common.tryAgain}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/setup")}
            >
              {t.onboarding.createInstead}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-muted-foreground" role="status">
          {accepting ? t.onboarding.accepting : t.onboarding.opening}
        </p>
      )}
    </JoinLayout>
  );
}
