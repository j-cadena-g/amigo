import { useState } from "react";
import { Pencil } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { formatSignedCents } from "@/app/lib/currency";
import { EditAssetDialog } from "@/app/components/edit-asset-dialog";
import { LedgerSubgroup, RowIconButton } from "@/app/components/financial/ledger-group";

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
  homeCurrency: CurrencyCode;
  session: { userId: string; role: string };
}

const TYPE_ORDER: Asset["type"][] = ["BANK", "INVESTMENT", "CASH", "PROPERTY"];

function byTypeOrder(a: Asset, b: Asset): number {
  return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
}

function assetTypeLabel(type: Asset["type"]): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

export function AssetCards({ assets, homeCurrency, session: _session }: AssetCardsProps) {
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const shared = assets.filter((a) => a.isShared).sort(byTypeOrder);
  const personal = assets.filter((a) => !a.isShared).sort(byTypeOrder);

  const renderRows = (items: Asset[]) =>
    items.map((asset) => (
      <AssetRow
        key={asset.id}
        asset={asset}
        homeCurrency={homeCurrency}
        onEdit={() => setEditingAsset(asset)}
      />
    ));

  return (
    <>
      {shared.length > 0 && (
        <LedgerSubgroup title="Shared">{renderRows(shared)}</LedgerSubgroup>
      )}
      {personal.length > 0 && (
        <LedgerSubgroup title="Personal">{renderRows(personal)}</LedgerSubgroup>
      )}

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

function AssetRow({
  asset,
  homeCurrency,
  onEdit,
}: {
  asset: Asset;
  homeCurrency: CurrencyCode;
  onEdit: () => void;
}) {
  const meta = [
    assetTypeLabel(asset.type),
    asset.isShared ? "Shared" : "Personal",
    asset.currency !== homeCurrency ? asset.currency : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-2 py-2.5">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{asset.name}</p>
          <p className="truncate text-sm text-muted-foreground">{meta}</p>
        </div>
        <span className="shrink-0 font-mono font-medium">
          {formatSignedCents(asset.balance, asset.currency)}
        </span>
      </div>
      <RowIconButton
        className="-mr-2"
        onClick={onEdit}
        aria-label={`Edit asset ${asset.name}`}
      >
        <Pencil />
      </RowIconButton>
    </li>
  );
}
