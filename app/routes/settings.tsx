import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, users, households, eq, and, isNull, scopeToHousehold } from "@amigo/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { MemberRoleManager } from "@/app/components/settings/member-role-manager";
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

export default function Settings() {
  const { household, members, session } = useLoaderData<typeof loader>();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your household preferences
        </p>
      </div>
      <div className="grid gap-4 max-w-2xl animate-stagger-in">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsThemeToggle />
          </CardContent>
        </Card>

        {/* Household Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Household</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="font-medium">{household.name}</p>
              <p className="text-sm text-muted-foreground">
                Managed via your Clerk organization
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">
                      {member.name || member.email}
                      {member.id === session.userId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {member.role}
                    </p>
                  </div>
                  {member.id !== session.userId &&
                    session.role === "owner" && (
                      <MemberRoleManager
                        member={{ id: member.id, displayName: member.name || member.email, role: member.role }}
                        currentUserRole={session.role}
                        currentUserId={session.userId}
                      />
                    )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
