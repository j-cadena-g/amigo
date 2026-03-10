import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, assets, scopeToHousehold, eq, and, or, isNull } from "@amigo/db";
import { AssetCards } from "@/app/components/asset-cards";
import { AddAssetDialog } from "@/app/components/add-asset-dialog";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const items = await db.query.assets.findMany({
    where: and(
      scopeToHousehold(assets.householdId, session.householdId),
      or(eq(assets.userId, session.userId), isNull(assets.userId)),
      isNull(assets.deletedAt)
    ),
    orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
  });

  return {
    assets: items.map(a => ({ ...a, isShared: a.userId === null })),
    userId: session.userId,
    role: session.role,
  };
}

export default function Assets() {
  const { assets: assetData, userId, role } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Assets
          </h1>
          <p className="mt-1 text-muted-foreground">
            Your household net worth
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
        >
          Add Asset
        </button>
        <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
      <AssetCards assets={assetData} session={{ userId, role }} />
    </main>
  );
}
