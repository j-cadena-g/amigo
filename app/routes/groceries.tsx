import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, groceryItems, groceryTags, scopeToHousehold, and, isNull } from "@amigo/db";
import { GroceryList } from "@/app/components/groceries/grocery-list";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [items, tags] = await Promise.all([
    db.query.groceryItems.findMany({
      where: and(
        scopeToHousehold(groceryItems.householdId, session.householdId),
        isNull(groceryItems.deletedAt)
      ),
      with: {
        groceryItemTags: {
          with: { groceryTag: true },
        },
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    }),
    db.query.groceryTags.findMany({
      where: scopeToHousehold(groceryTags.householdId, session.householdId),
      orderBy: (tags, { asc }) => [asc(tags.name)],
    }),
  ]);

  return {
    items,
    tags,
    userId: session.userId,
    householdId: session.householdId,
  };
}

export default function Groceries() {
  const { items, tags } = useLoaderData<typeof loader>();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Groceries
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your household shopping list
        </p>
      </div>
      <GroceryList
        items={items}
        allTags={tags}
      />
    </main>
  );
}
