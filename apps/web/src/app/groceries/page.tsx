import { db, eq, isNull, and, desc } from "@amigo/db";
import { groceryItems } from "@amigo/db/schema";
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

  // Fetch grocery items directly from DB (RSC pattern)
  const items = await db
    .select()
    .from(groceryItems)
    .where(
      and(
        eq(groceryItems.householdId, session.householdId),
        isNull(groceryItems.deletedAt)
      )
    )
    .orderBy(desc(groceryItems.createdAt));

  const wsUrl = getWsUrl();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Groceries</h1>
        <p className="text-gray-500">Manage your shopping list</p>
      </div>

      <GroceryList initialItems={items} wsUrl={wsUrl} />
    </main>
  );
}
