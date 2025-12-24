"use client";

import { useState, useTransition } from "react";
import { deleteAsset } from "@/actions/assets";
import { EditAssetDialog } from "@/components/edit-asset-dialog";
import { useConfirm } from "@/components/confirm-provider";
import type { Asset } from "@amigo/db";

interface AssetCardsProps {
  assets: Asset[];
}

type AssetTypeKey = "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";

const typeConfig: Record<
  AssetTypeKey,
  { label: string; colorClass: string; bgClass: string }
> = {
  BANK: {
    label: "Bank",
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10",
  },
  INVESTMENT: {
    label: "Investment",
    colorClass: "text-green-600 dark:text-green-400",
    bgClass: "bg-green-500/10",
  },
  CASH: {
    label: "Cash",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  PROPERTY: {
    label: "Property",
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-500/10",
  },
};

function AssetCard({ asset }: { asset: Asset }) {
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const confirm = useConfirm();

  const balance = parseFloat(asset.balance);
  const config = typeConfig[asset.type] || typeConfig.BANK;

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete Asset?",
      description: `Are you sure you want to delete "${asset.name}"? This cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (confirmed) {
      startTransition(async () => {
        await deleteAsset(asset.id);
      });
    }
  };

  return (
    <>
      <div
        className="cursor-pointer rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md"
        onClick={() => setIsEditOpen(true)}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.colorClass}`}
            >
              {config.label}
            </span>
            <h3 className="mt-1 text-lg font-semibold">{asset.name}</h3>
          </div>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditOpen(true);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Edit asset"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label="Delete asset"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Balance</span>
          <span className="text-2xl font-bold text-green-600 dark:text-green-400">
            ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      <EditAssetDialog
        asset={asset}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </>
  );
}

export function AssetCards({ assets }: AssetCardsProps) {
  // Group assets by type
  const grouped = assets.reduce(
    (acc, asset) => {
      const type = asset.type as AssetTypeKey;
      if (!acc[type]) acc[type] = [];
      acc[type].push(asset);
      return acc;
    },
    {} as Partial<Record<AssetTypeKey, Asset[]>>
  );

  const typeOrder: AssetTypeKey[] = ["BANK", "INVESTMENT", "CASH", "PROPERTY"];
  const sortedTypes = typeOrder.filter((t) => (grouped[t]?.length ?? 0) > 0);

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          No assets yet. Add your first asset to start tracking your net worth.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedTypes.map((type) => {
        const typeAssets = grouped[type];
        if (!typeAssets) return null;
        return (
          <div key={type}>
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">
              {typeConfig[type].label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {typeAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
