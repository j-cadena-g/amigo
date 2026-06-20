import { useState } from "react";
import { useAuth } from "@clerk/react-router";
import { redirect, useNavigate, type LoaderFunctionArgs } from "react-router";
import { CURRENCY_CODES } from "@amigo/db";
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

export default function Setup() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [householdName, setHouseholdName] = useState("My Household");
  const [currency, setCurrency] = useState("CAD");
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to amigo</h1>
          <p className="text-muted-foreground mt-2">
            Let&apos;s set up your household.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="householdName" className="block text-sm font-medium mb-1">
              Household name
            </label>
            <input
              id="householdName"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm"
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

          <button
            type="submit"
            disabled={submitting || householdName.trim().length === 0}
            className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create household"}
          </button>
        </form>
      </div>
    </main>
  );
}
