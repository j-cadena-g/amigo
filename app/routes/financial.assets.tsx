import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, assets, scopeToHousehold, eq, and, or, isNull } from "@amigo/db";
import { AssetCards } from "@/app/components/asset-cards";
import { AddAssetDialog } from "@/app/components/add-asset-dialog";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";

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
    assets: items.map((a) => ({ ...a, isShared: a.userId === null })),
    userId: session.userId,
    role: session.role,
  };
}

export default function FinancialAssets() {
  const { assets: assetData, userId, role } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <FinancialSectionHeader
        title="Assets"
        description="Your household net worth"
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
          >
            Add asset
          </button>
        }
      />
      <AssetCards assets={assetData} session={{ userId, role }} />
      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
