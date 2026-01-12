import { db, eq, and, isNull } from "@amigo/db";
import { households, users } from "@amigo/db/schema";
import type { UserRole } from "@amigo/db";
import { getSession } from "@/lib/session";
import { canManageHousehold, canManageMembers, canTransferOwnership } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SettingsThemeToggle } from "@/components/settings-theme-toggle";
import { RenameHouseholdDialog } from "@/components/rename-household-dialog";
import { CopyHouseholdId } from "@/components/copy-household-id";
import { MemberRoleManager } from "@/components/member-role-manager";
import { LogOut, Crown, Shield, User } from "lucide-react";

export const dynamic = "force-dynamic";

const APP_VERSION = "v0.1.0";

const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  owner: { label: "Owner", color: "text-yellow-500" },
  admin: { label: "Admin", color: "text-blue-500" },
  member: { label: "Member", color: "text-muted-foreground" },
};

function getRoleIcon(role: UserRole) {
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return User;
  }
}

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch household info and members with roles
  const [household, householdMembers] = await Promise.all([
    db
      .select()
      .from(households)
      .where(eq(households.id, session.householdId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          eq(users.householdId, session.householdId),
          isNull(users.deletedAt)
        )
      ),
  ]);

  const canEdit = canManageHousehold(session);
  const canManage = canManageMembers(session);
  const canTransfer = canTransferOwnership(session);

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
                {canEdit ? (
                  <RenameHouseholdDialog currentName={household?.name ?? "Unknown"} />
                ) : (
                  <p className="text-lg">{household?.name ?? "Unknown"}</p>
                )}
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

        {/* Household Members Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Household Members</h2>
          <div className="space-y-3">
            {householdMembers.map((member) => {
              const roleConfig = ROLE_CONFIG[member.role];
              const RoleIcon = getRoleIcon(member.role);

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                    {(member.name ?? member.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {member.name ?? "Unknown"}
                        {member.id === session.userId && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <div className={`flex items-center gap-1 ${roleConfig.color}`}>
                        <RoleIcon className="h-3 w-3" />
                        <span className="text-xs">{roleConfig.label}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {member.email}
                    </p>
                  </div>

                  {/* Role management for non-self members */}
                  {canManage && member.id !== session.userId && (
                    <MemberRoleManager
                      member={member}
                      currentUserRole={session.role}
                      canTransfer={canTransfer}
                    />
                  )}
                </div>
              );
            })}
          </div>
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
            <div className="pt-2">
              <a
                href="/api/auth/logout"
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
