import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, groceryItems, groceryTags, scopeToHousehold, and, isNull } from "@amigo/db";
import { GroceryList } from "@/app/components/groceries/grocery-list";
import { PushNotificationButton } from "@/app/components/push-notification-button";
import {
  hydrateFromServer,
  getOfflineItems,
  getOfflineTags,
  isOfflineSupported,
} from "@/app/lib/offline";
import type { GroceryItemWithTags } from "@/app/components/groceries/types";

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
    fromOffline: false as const,
  };
}

function mapOfflineToLoaderShape(
  offlineItems: Awaited<ReturnType<typeof getOfflineItems>>,
  offlineTags: Awaited<ReturnType<typeof getOfflineTags>>,
  userId: string,
  householdId: string
) {
  const tagById = new Map(offlineTags.map((t) => [t.id, t]));
  const items: GroceryItemWithTags[] = offlineItems.map((item) => ({
    id: item.id,
    householdId: item.householdId,
    createdByUserId: item.createdByUserId,
    createdByUserDisplayName: item.createdByUserDisplayName,
    itemName: item.itemName,
    category: item.category,
    isPurchased: item.isPurchased,
    purchasedAt: item.purchasedAt ? new Date(item.purchasedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
    transferredFromCreatedByUserId: null,
    groceryItemTags: [],
    createdByUser:
      item.createdByUserId === userId
        ? { id: userId, name: item.createdByUserDisplayName, email: "" }
        : item.createdByUserId
          ? {
              id: item.createdByUserId,
              name: item.createdByUserDisplayName,
              email: "",
            }
          : null,
  }));

  void tagById;

  return {
    items,
    tags: offlineTags.map((t) => ({
      id: t.id,
      householdId: t.householdId,
      name: t.name,
      color: t.color,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    })),
    userId,
    householdId,
    fromOffline: true as const,
  };
}

export async function clientLoader({
  serverLoader,
}: {
  serverLoader: () => ReturnType<typeof loader>;
}) {
  if (!isOfflineSupported()) {
    return serverLoader();
  }

  try {
    const data = await serverLoader();
    void hydrateFromServer(
      data.items.map((item) => ({
        id: item.id,
        householdId: item.householdId,
        createdByUserId: item.createdByUserId,
        createdByUserDisplayName: item.createdByUserDisplayName,
        itemName: item.itemName,
        category: item.category,
        isPurchased: item.isPurchased,
        purchasedAt: item.purchasedAt?.getTime() ?? null,
        createdAt: item.createdAt.getTime(),
        updatedAt: item.updatedAt.getTime(),
        deletedAt: item.deletedAt?.getTime() ?? null,
        tags: item.groceryItemTags.map((git) => ({
          id: git.groceryTag.id,
          name: git.groceryTag.name,
          color: git.groceryTag.color,
        })),
      })),
      data.tags.map((tag) => ({
        id: tag.id,
        householdId: tag.householdId,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt.getTime(),
        updatedAt: tag.updatedAt.getTime(),
      }))
    );
    return data;
  } catch {
    const offlineItems = await getOfflineItems();
    const offlineTags = await getOfflineTags();
    if (offlineItems.length === 0 && offlineTags.length === 0) {
      throw new Error("Offline and no cached grocery data");
    }
    return mapOfflineToLoaderShape(
      offlineItems,
      offlineTags,
      "",
      offlineItems[0]?.householdId ?? ""
    );
  }
}

clientLoader.hydrate = true;

export default function Groceries() {
  const { items, tags, userId, fromOffline } = useLoaderData<typeof loader>();

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="mb-6 flex animate-fade-in items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Groceries
          </h1>
          <p className="mt-1 text-muted-foreground">
            Your household shopping list
          </p>
          {fromOffline && (
            <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
              Showing offline data — changes will sync when you&apos;re back online.
            </p>
          )}
        </div>
        <PushNotificationButton />
      </div>
      <GroceryList items={items} allTags={tags} userId={userId} />
    </main>
  );
}
