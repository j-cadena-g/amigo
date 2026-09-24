import { useEffect, useState } from "react";
import { SignIn, useAuth } from "@clerk/react-router";
import {
  redirect,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { Button } from "@/app/components/ui/button";
import { Wordmark } from "@/app/components/wordmark";
import { acceptInvite } from "@/app/lib/accept-invite";
import { getSessionStatus } from "@/app/lib/session.server";

const MISSING_CODE_ERROR =
  "This link is missing its invite code. Open the full link from your invite.";

export function loader({ context, params }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  const code = params.code ?? "";

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return { status, code };
}

export function meta() {
  return [{ title: "Join household · amigo" }];
}

function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">Join household</h1>
        {children}
      </div>
    </main>
  );
}

export default function JoinInvite() {
  const { status, code } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(
    status === "needs_setup" && !code ? MISSING_CODE_ERROR : null
  );
  const [accepting, setAccepting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status !== "needs_setup") {
      return;
    }

    if (!code) {
      setError(MISSING_CODE_ERROR);
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

      setError(result.error);
      setAccepting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, code, getToken, navigate, retryCount]);

  if (status === "unauthenticated") {
    const returnTo = `/join/${encodeURIComponent(code)}`;
    return (
      <JoinLayout>
        <p className="mt-2 text-muted-foreground">
          Sign in or create an account to accept the invite.
        </p>
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
        <p className="mt-2">
          Your account already belongs to a household, so this invite can&apos;t be
          used with it. To accept it, sign in with a different account.
        </p>
        <Button className="mt-6 w-full" onClick={() => navigate("/dashboard")}>
          Go to your household
        </Button>
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
          {error !== MISSING_CODE_ERROR && (
            <p className="mt-2 text-sm text-muted-foreground">
              If the invite expired or was already used, ask for a new one.
            </p>
          )}
          <div className="mt-6 space-y-3">
            <Button
              className="w-full"
              disabled={accepting}
              onClick={() => setRetryCount((count) => count + 1)}
            >
              Try again
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/setup")}
            >
              Create a household instead
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-muted-foreground" role="status">
          {accepting ? "Accepting the invite…" : "Opening the invite…"}
        </p>
      )}
    </JoinLayout>
  );
}
