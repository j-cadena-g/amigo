import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { formatCents } from "@/app/lib/currency";
import { Pencil } from "lucide-react";
import { EditAssetDialog } from "@/app/components/edit-asset-dialog";
import type { CurrencyCode } from "@amigo/db";

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
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            {assetTypeLabel(type)} ({group.length})
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
            <h2 className="text-sm font-semibold text-muted-foreground">Shared</h2>
            {renderAssetGroup(shared)}
          </div>
        )}
        {personal.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Personal</h2>
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

function assetTypeLabel(type: Asset["type"]): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function AssetCard({ asset, onEdit }: { asset: Asset; onEdit: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{asset.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {assetTypeLabel(asset.type)}
              {asset.isShared ? " · Shared" : ""}
            </p>
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
