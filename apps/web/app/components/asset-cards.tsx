import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { formatCents } from "@/app/lib/currency";
import { Pencil } from "lucide-react";
import { EditAssetDialog } from "@/app/components/edit-asset-dialog";
import type { CurrencyCode } from "@amigo/db";

export const ASSET_TYPE_COLORS = {
  BANK: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  INVESTMENT: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300" },
  CASH: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" },
  PROPERTY: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" },
} as const;

export interface Asset {
  id: string;
  name: string;
  type: "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";
  balance: number; // cents
  currency: CurrencyCode;
  exchangeRateToHome: number | null;
  userId: string | null;
  isShared?: boolean;
  createdAt: Date | number;
}

interface AssetCardsProps {
  assets: Asset[];
  session: { userId: string; role: string };
}

export function AssetCards({ assets, session: _session }: AssetCardsProps) {
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const shared = assets.filter((a) => a.isShared);
  const personal = assets.filter((a) => !a.isShared);

  const typeOrder: Asset["type"][] = ["BANK", "INVESTMENT", "CASH", "PROPERTY"];

  function renderAssetGroup(items: Asset[]) {
    const grouped = items.reduce<Record<string, Asset[]>>((acc, asset) => {
      const key = asset.type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(asset);
      return acc;
    }, {});

    return typeOrder.map((type) => {
      const group = grouped[type];
      if (!group || group.length === 0) return null;
      return (
        <div key={type}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {type.charAt(0) + type.slice(1).toLowerCase()} ({group.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onEdit={() => setEditingAsset(asset)} />
            ))}
          </div>
        </div>
      );
    });
  }

  return (
    <>
      <div className="space-y-6">
        {shared.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Shared</h2>
            {renderAssetGroup(shared)}
          </div>
        )}
        {personal.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Personal</h2>
            {renderAssetGroup(personal)}
          </div>
        )}
      </div>

      {editingAsset && (
        <EditAssetDialog
          asset={editingAsset}
          open={!!editingAsset}
          onOpenChange={(open) => {
            if (!open) setEditingAsset(null);
          }}
        />
      )}
    </>
  );
}

function AssetCard({ asset, onEdit }: { asset: Asset; onEdit: () => void }) {
  const colors = ASSET_TYPE_COLORS[asset.type];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{asset.name}</CardTitle>
            <div className="flex gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
              >
                {asset.type.charAt(0) + asset.type.slice(1).toLowerCase()}
              </span>
              {asset.isShared && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                  Shared
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">
          {formatCents(asset.balance, asset.currency)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{asset.currency}</p>
      </CardContent>
    </Card>
  );
}
