import { db, eq } from "@amigo/db";
import { households } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SettingsThemeToggle } from "@/components/settings-theme-toggle";
import { RenameHouseholdDialog } from "@/components/rename-household-dialog";
import { CopyHouseholdId } from "@/components/copy-household-id";
import { JoinHouseholdForm } from "@/components/join-household-form";

export const dynamic = "force-dynamic";

const APP_VERSION = "v0.1.0";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch household info
  const household = await db
    .select()
    .from(households)
    .where(eq(households.id, session.householdId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        {/* Household Info Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Household Info</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Household Name
              </p>
              <div className="mt-1">
                <RenameHouseholdDialog currentName={household?.name ?? "Unknown"} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Household ID
              </p>
              <div className="mt-1">
                <CopyHouseholdId householdId={session.householdId} />
              </div>
            </div>
          </div>
        </div>

        {/* Join Household Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Join Household</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter another household&apos;s ID to join them. Your groceries, debts, and transactions will be migrated.
          </p>
          <JoinHouseholdForm />
        </div>

        {/* Theme Preference Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Theme Preference</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Choose how amigo looks for you. Select a single option to set your preferred theme.
          </p>
          <SettingsThemeToggle />
        </div>

        {/* App Info Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">App Info</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Version
              </p>
              <p className="mt-1 font-mono text-lg">{APP_VERSION}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Logged in as
              </p>
              <p className="mt-1">{session.name ?? session.email}</p>
              {session.name && (
                <p className="text-sm text-muted-foreground">{session.email}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
