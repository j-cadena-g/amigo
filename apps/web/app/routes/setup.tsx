import { useState } from "react";
import { useAuth } from "@clerk/react-router";
import { redirect, useNavigate, type LoaderFunctionArgs } from "react-router";
import { CURRENCY_CODES } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Wordmark } from "@/app/components/wordmark";
import { acceptInvite } from "@/app/lib/accept-invite";
import {
  buildTimezoneOptions,
  getBrowserTimezone,
} from "@/app/lib/timezones";
import { getSessionStatus } from "@/app/lib/session.server";

const SELECT_CLASS =
  "mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base";

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
  const [householdName, setHouseholdName] = useState("My household");
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
      setError(data?.error ?? "Couldn't create the household. Try again.");
    } catch {
      setError("Couldn't create the household. Check your connection and try again.");
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
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">Set up your household</h1>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowInviteCode((open) => !open)}
            aria-expanded={showInviteCode}
            aria-controls="invite-code-form"
            className="block py-2 text-left text-muted-foreground hover:text-foreground"
          >
            {showInviteCode ? (
              "Hide invite code"
            ) : (
              <>
                Joining someone&apos;s household?{" "}
                <span className="font-semibold text-foreground underline decoration-muted-foreground/60 underline-offset-4">
                  Enter an invite code
                </span>
              </>
            )}
          </button>

          {showInviteCode && (
            <form
              id="invite-code-form"
              onSubmit={handleAcceptInvite}
              className="mt-4 border-b border-border pb-8"
            >
              <label htmlFor="inviteCode" className="block text-sm font-semibold">
                Invite code
              </label>
              <Input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="mt-1.5 font-mono uppercase"
                placeholder="AMIGO-XXXXXXXXXXXXX"
                autoComplete="off"
                required
              />

              {inviteError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {inviteError}
                </p>
              )}

              <Button
                type="submit"
                disabled={acceptingInvite || inviteCode.trim().length === 0}
                className="mt-4 w-full"
              >
                {acceptingInvite ? "Joining…" : "Join household"}
              </Button>
            </form>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="householdName" className="block text-sm font-semibold">
              Household name
            </label>
            <Input
              id="householdName"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              maxLength={100}
              aria-describedby="householdName-hint"
              className="mt-1.5"
            />
            <p id="householdName-hint" className="mt-1.5 text-sm text-muted-foreground">
              Everyone you invite sees this name. You can change it later in
              Settings.
            </p>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-semibold">
              Home currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={SELECT_CLASS}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-semibold">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-describedby="timezone-hint"
              className={SELECT_CLASS}
            >
              {buildTimezoneOptions(timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p id="timezone-hint" className="mt-1.5 text-sm text-muted-foreground">
              Budget periods and transaction dates use your household&apos;s local
              calendar day.
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
            {submitting ? "Creating…" : "Create household"}
          </Button>
        </form>
      </div>
    </main>
  );
}
