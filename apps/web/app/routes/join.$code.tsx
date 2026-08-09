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
import { getSessionStatus } from "@/app/lib/session.server";

export function loader({ context, params }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);
  const code = params.code ?? "";

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return { status, code };
}

type AcceptResult = { ok: true } | { ok: false; error: string };

const acceptInFlight = new Map<string, Promise<AcceptResult>>();

async function acceptInvite(
  code: string,
  getToken: () => Promise<string | null>
): Promise<AcceptResult> {
  const existing = acceptInFlight.get(code);
  if (existing) {
    return existing;
  }

  const request = (async (): Promise<AcceptResult> => {
    try {
      const token = await getToken();
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        return { ok: true };
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { ok: false, error: data?.error ?? "Could not accept invite" };
    } catch {
      return { ok: false, error: "Network error. Please try again." };
    }
  })();

  acceptInFlight.set(code, request);
  try {
    return await request;
  } finally {
    acceptInFlight.delete(code);
  }
}

export default function JoinInvite() {
  const { status, code } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status !== "needs_setup" || !code) {
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
