import { db, eq } from "@amigo/db";
import { households } from "@amigo/db/schema";
import { getSession } from "@/lib/session";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  // Get user's household
  const household = session
    ? await db.query.households.findFirst({
        where: eq(households.id, session.householdId),
      })
    : null;

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">amigo</h1>
        {session && (
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {session.name ?? session.email}
            </span>
            <a
              href="/api/auth/logout"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Logout
            </a>
          </div>
        )}
      </div>

      <p className="text-muted-foreground mb-8">
        Household budgeting with grocery tracking
      </p>

      {household && (
        <section className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">{household.name}</h2>
          <p className="text-muted-foreground">
            Welcome to your household dashboard.
          </p>
        </section>
      )}
    </main>
  );
}
