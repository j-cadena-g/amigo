import { useState } from "react";
import { useNavigate } from "react-router";
import { useOrganization } from "@clerk/react-router";
import { CURRENCY_CODES } from "@amigo/db";

export default function Setup() {
  const { organization, isLoaded } = useOrganization();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState("CAD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </main>
    );
  }

  const orgName = organization?.name ?? "My Household";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdName: orgName,
        homeCurrency: currency,
      }),
    });

    if (res.ok) {
      navigate("/dashboard");
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "Something went wrong");
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
            <label className="block text-sm font-medium mb-1">Household</label>
            <div className="px-3 py-2 rounded-md border bg-muted text-sm">
              {orgName}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Managed through your Clerk organization.
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
            <p className="text-xs text-muted-foreground mt-1">
              Your primary currency for budgets and reports.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Setting up..." : "Get Started"}
          </button>
        </form>
      </div>
    </main>
  );
}
