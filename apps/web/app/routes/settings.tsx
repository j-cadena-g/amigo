import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  users,
  households,
  eq,
  and,
  isNull,
  parseHomeCurrency,
  scopeToHousehold,
} from "@amigo/db";
import { LedgerSection } from "@/app/components/ledger";
import { AccountSettings } from "@/app/components/settings/account-settings";
import { HouseholdSettingsForm } from "@/app/components/settings/household-settings-form";
import { InviteManager } from "@/app/components/settings/invite-manager";
import { LeaveHousehold } from "@/app/components/settings/leave-household";
import { MemberRoleManager } from "@/app/components/settings/member-role-manager";
import { NotificationSettings } from "@/app/components/settings/notification-settings";
import { SettingsThemeToggle } from "@/app/components/settings/theme-toggle";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [household, members] = await Promise.all([
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
    db.query.users.findMany({
      where: and(
        scopeToHousehold(users.householdId, session.householdId),
        isNull(users.deletedAt)
      ),
      columns: { id: true, name: true, email: true, role: true },
    }),
  ]);

  return {
    household: household!,
    members,
    session: {
      userId: session.userId,
      role: session.role,
    },
  };
}

export function meta() {
  return [{ title: "Settings · amigo" }];
}

export default function Settings() {
  const { household, members, session } = useLoaderData<typeof loader>();
  const canManageHousehold =
    session.role === "owner" || session.role === "admin";

  return (
    <main className="container mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="max-w-2xl">
        <h1 className="type-display text-title-sm md:text-title">Settings</h1>

        <div className="mt-8 space-y-10">
          <LedgerSection title="Household">
            <div className="pt-4">
              <HouseholdSettingsForm
                name={household.name}
                homeCurrency={parseHomeCurrency(household.homeCurrency)}
                timezone={household.timezone ?? "UTC"}
                canEdit={canManageHousehold}
              />
            </div>
          </LedgerSection>

          <LedgerSection
            title="Members"
            aside={
              <span className="font-mono text-sm text-muted-foreground">
                {members.length}
              </span>
            }
          >
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {member.name || member.email}
                      {member.id === session.userId && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {member.role}
                    </p>
                  </div>
                  {member.id !== session.userId && canManageHousehold && (
                    <MemberRoleManager
                      member={{
                        id: member.id,
                        displayName: member.name || member.email,
                        role: member.role,
                      }}
                      currentUserRole={session.role}
                      currentUserId={session.userId}
                    />
                  )}
                </li>
              ))}
            </ul>
          </LedgerSection>

          {canManageHousehold && (
            <LedgerSection title="Invites">
              <div className="pt-4">
                <InviteManager />
              </div>
            </LedgerSection>
          )}

          <LedgerSection title="Notifications">
            <div className="pt-4">
              <NotificationSettings />
            </div>
          </LedgerSection>

          <LedgerSection title="Appearance">
            <div className="pt-4">
              <SettingsThemeToggle />
              <p className="mt-2 text-sm text-muted-foreground">
                Applies to this device only.
              </p>
            </div>
          </LedgerSection>

          <LedgerSection title="Account">
            <div className="pt-4">
              <AccountSettings />
            </div>
          </LedgerSection>

          <LedgerSection title="Leave household">
            <div className="pt-4">
              <LeaveHousehold role={session.role} />
            </div>
          </LedgerSection>
        </div>
      </div>
    </main>
  );
}
