import { db } from "@amigo/db";
import { households } from "@amigo/db/schema";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Direct DB access pattern - Server Components query directly
  const allHouseholds = await db.select().from(households).limit(10);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">amigo</h1>
      <p className="text-muted-foreground mb-8">
        Household budgeting with grocery tracking
      </p>

      <section className="rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">Households</h2>
        {allHouseholds.length === 0 ? (
          <p className="text-muted-foreground">
            No households yet. Create one to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {allHouseholds.map((household) => (
              <li key={household.id} className="p-3 bg-secondary rounded-md">
                {household.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
