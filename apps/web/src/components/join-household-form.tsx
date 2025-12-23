"use client";

import { useState, useTransition } from "react";
import { joinHousehold } from "@/actions/settings";
import { useRouter } from "next/navigation";

export function JoinHouseholdForm() {
  const [householdId, setHouseholdId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedId = householdId.trim();
    if (!trimmedId) {
      setError("Please enter a household ID");
      return;
    }

    startTransition(async () => {
      const result = await joinHousehold({ targetHouseholdId: trimmedId });
      if (result.success) {
        setSuccess(`Successfully joined household "${result.householdName}"`);
        setHouseholdId("");
        // Refresh the page to show updated data
        router.refresh();
      } else {
        setError(result.error ?? "Failed to join household");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={householdId}
          onChange={(e) => setHouseholdId(e.target.value)}
          placeholder="Enter household ID"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !householdId.trim()}
          className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? "Joining..." : "Join"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
      )}
    </form>
  );
}
