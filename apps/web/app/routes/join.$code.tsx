import { useEffect, useState } from "react";
import { SignIn, useAuth } from "@clerk/react-router";
import {
  redirect,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { acceptInvite } from "@/app/lib/accept-invite";
import { getSessionStatus } from "@/app/lib/session.server";

export function loader({ context, params }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  const code = params.code ?? "";

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return { status, code };
}

export default function JoinInvite() {
  const { status, code } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(
    status === "needs_setup" && !code ? "Invite code is missing" : null
  );
  const [accepting, setAccepting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status !== "needs_setup") {
      return;
    }

    if (!code) {
      setError("Invite code is missing");
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
      <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Join household
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to accept your invitation.
          </p>
        </div>
        <SignIn
          routing="hash"
          forceRedirectUrl={returnTo}
          signUpForceRedirectUrl={returnTo}
        />
      </main>
    );
  }

  if (status === "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Already in a household</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You already belong to a household
            </p>
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Joining household</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <>
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
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
                Set up your own household
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {accepting ? "Accepting invite…" : "Preparing…"}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
