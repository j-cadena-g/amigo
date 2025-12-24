import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAssets } from "@/actions/assets";
import { AssetCards } from "@/components/asset-cards";
import { AddAssetDialog } from "@/components/add-asset-dialog";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  // Fetch all assets for the current user (private - filtered by userId)
  const allAssets = await getAssets();

  // Calculate total assets
  const totalAssets = allAssets.reduce(
    (sum, asset) => sum + parseFloat(asset.balance),
    0
  );

  // Group totals by type for the summary
  const totalsByType = allAssets.reduce(
    (acc, asset) => {
      const balance = parseFloat(asset.balance);
      acc[asset.type] = (acc[asset.type] || 0) + balance;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="text-primary">My</span> Assets
          </h1>
          <p className="text-muted-foreground">
            Private asset tracking (only visible to you)
          </p>
        </div>
        <AddAssetDialog />
      </div>

      {/* Summary Card */}
      <div className="mb-8 rounded-lg border bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Total Assets</p>
        <p className="mt-1 text-4xl font-bold text-green-600 dark:text-green-400">
          ${totalAssets.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        {Object.keys(totalsByType).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4">
            {totalsByType["BANK"] !== undefined && (
              <div className="text-sm">
                <span className="text-muted-foreground">Bank: </span>
                <span className="font-medium">
                  ${totalsByType["BANK"].toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {totalsByType["INVESTMENT"] !== undefined && (
              <div className="text-sm">
                <span className="text-muted-foreground">Investment: </span>
                <span className="font-medium">
                  ${totalsByType["INVESTMENT"].toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {totalsByType["CASH"] !== undefined && (
              <div className="text-sm">
                <span className="text-muted-foreground">Cash: </span>
                <span className="font-medium">
                  ${totalsByType["CASH"].toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {totalsByType["PROPERTY"] !== undefined && (
              <div className="text-sm">
                <span className="text-muted-foreground">Property: </span>
                <span className="font-medium">
                  ${totalsByType["PROPERTY"].toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Asset Cards */}
      <AssetCards assets={allAssets} />
    </main>
  );
}
