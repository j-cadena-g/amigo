import { db, eq, isNull, and, desc } from "@amigo/db";
import { groceryItems, groceryTags } from "@amigo/db/schema";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { GroceryList } from "@/components/grocery-list";
import { clearOldPurchasedItems } from "@/actions/groceries";
import { PushNotificationButton } from "@/components/push-notification-button";

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

  // Clean up items purchased more than 90 days ago
  await clearOldPurchasedItems();

  // Fetch grocery items with their tags and creator using query API
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
      createdByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Groceries</h1>
          <p className="text-muted-foreground">Manage your shopping list</p>
        </div>
        <PushNotificationButton />
      </div>

      <GroceryList
        initialItems={items}
        allTags={allTags}
        wsUrl={wsUrl}
        householdId={session.householdId}
        userId={session.userId}
      />
    </main>
  );
}
