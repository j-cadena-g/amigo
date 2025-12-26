import { db, eq, isNull, and, desc } from "@amigo/db";
import { groceryItems, groceryTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { GroceryList } from "@/components/grocery-list";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

function getWsUrl(): string {
  // For client-side, we'll pass a relative path and let the client construct the full URL
  // This ensures wss:// is used when the page is served over https://
  return "/ws";
}

export default async function GroceriesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch grocery items with their tags using query API
  const items = await db.query.groceryItems.findMany({
    where: and(
      eq(groceryItems.householdId, session.householdId),
      isNull(groceryItems.deletedAt)
    ),
    orderBy: [desc(groceryItems.createdAt)],
    with: {
      groceryItemTags: {
        with: {
          groceryTag: true,
        },
      },
    },
  });

  // Fetch all tags for the household
  const allTags = await db.query.groceryTags.findMany({
    where: eq(groceryTags.householdId, session.householdId),
    orderBy: [desc(groceryTags.name)],
  });

  const wsUrl = getWsUrl();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Groceries</h1>
        <p className="text-muted-foreground">Manage your shopping list</p>
      </div>

      <GroceryList initialItems={items} allTags={allTags} wsUrl={wsUrl} />
    </main>
  );
}
