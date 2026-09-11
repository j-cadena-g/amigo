import { useState } from "react";
import { useAuth } from "@clerk/react-router";
import { redirect, useNavigate, type LoaderFunctionArgs } from "react-router";
import { CURRENCY_CODES } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { acceptInvite } from "@/app/lib/accept-invite";
import {
  buildTimezoneOptions,
  getBrowserTimezone,
} from "@/app/lib/timezones";
import { getSessionStatus } from "@/app/lib/session.server";

export function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);

  if (status === "unauthenticated") {
    throw redirect("/");
  }

  if (status === "authenticated") {
    throw redirect("/dashboard");
  }

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return null;
}

export function meta() {
  return [{ title: "Set up your household · amigo" }];
}

export default function Setup() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [householdName, setHouseholdName] = useState("My Household");
  const [currency, setCurrency] = useState("CAD");
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          householdName: householdName.trim(),
          homeCurrency: currency,
          timezone,
        }),
      });

      if (res.ok) {
        navigate("/dashboard");
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    setAcceptingInvite(true);
    setInviteError(null);

    const result = await acceptInvite(inviteCode.trim(), getToken);
    if (result.ok) {
      navigate("/dashboard");
      return;
    }

    setInviteError(result.error);
    setAcceptingInvite(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">Welcome to amigo</h1>
          <p className="text-muted-foreground mt-2">
            Let&apos;s set up your household.
          </p>
        </div>

        <div className="mb-8 space-y-3">
          <Button
            type="button"
            variant="link"
            onClick={() => setShowInviteCode((open) => !open)}
            aria-expanded={showInviteCode}
            aria-controls="invite-code-form"
            className="h-auto p-0"
          >
            {showInviteCode ? "Hide invite code" : "Have an invite code?"}
          </Button>

          {showInviteCode && (
            <form id="invite-code-form" onSubmit={handleAcceptInvite} className="space-y-3 rounded-md border p-4">
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium mb-1">
                  Invite code
                </label>
                <Input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="font-mono uppercase"
                  placeholder="AMIGO-XXXXXXXXXXXXX"
                  autoComplete="off"
                  required
                />
              </div>

              {inviteError && (
                <p className="text-sm text-destructive" role="alert">
                  {inviteError}
                </p>
              )}

              <Button
                type="submit"
                disabled={acceptingInvite || inviteCode.trim().length === 0}
                className="w-full"
              >
                {acceptingInvite ? "Joining..." : "Join household"}
              </Button>
            </form>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="householdName" className="block text-sm font-medium mb-1">
              Household name
            </label>
            <Input
              id="householdName"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This name is stored in the app and tagged on your Clerk profile.
            </p>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium mb-1">
              Home Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium mb-1">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            >
              {buildTimezoneOptions(timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Budget periods and transaction dates use your household&apos;s local calendar day.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || householdName.trim().length === 0}
            className="w-full"
          >
            {submitting ? "Creating..." : "Create household"}
          </Button>
        </form>
      </div>
    </main>
  );
}
