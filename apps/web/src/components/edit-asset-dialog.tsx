"use client";

import { useState, useTransition } from "react";
import { updateAsset, deleteAsset } from "@/actions/assets";
import { useConfirm } from "@/components/confirm-provider";
import type { Asset } from "@amigo/db";

type AssetType = "BANK" | "INVESTMENT" | "CASH" | "PROPERTY";

const assetTypes: { value: AssetType; label: string }[] = [
  { value: "BANK", label: "Bank Account" },
  { value: "INVESTMENT", label: "Investment" },
  { value: "CASH", label: "Cash" },
  { value: "PROPERTY", label: "Property" },
];

interface EditAssetDialogProps {
  asset: Asset;
  isOpen: boolean;
  onClose: () => void;
}

function EditAssetForm({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const [name, setName] = useState(asset.name);
  const [balance, setBalance] = useState(asset.balance);
  const [type, setType] = useState<AssetType>(asset.type as AssetType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await updateAsset(asset.id, {
          name,
          balance: parseFloat(balance) || 0,
          type,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update asset");
      }
    });
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete Asset?",
      description: `Are you sure you want to delete "${asset.name}"? This cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (confirmed) {
      startDeleteTransition(async () => {
        try {
          await deleteAsset(asset.id);
          onClose();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to delete asset"
          );
        }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Asset</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="editAssetName"
              className="mb-1 block text-sm font-medium"
            >
              Asset Name
            </label>
            <input
              id="editAssetName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chase Checking, 401k"
              className="w-full rounded-md border border-input bg-background px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label
              htmlFor="editAssetType"
              className="mb-1 block text-sm font-medium"
            >
              Type
            </label>
            <select
              id="editAssetType"
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {assetTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="editAssetBalance"
              className="mb-1 block text-sm font-medium"
            >
              Current Balance
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-muted-foreground">
                $
              </span>
              <input
                id="editAssetBalance"
                type="number"
                min="0"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background py-2 pl-7 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isPending}
              className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
            <div className="flex flex-1 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || isDeleting}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditAssetDialog({
  asset,
  isOpen,
  onClose,
}: EditAssetDialogProps) {
  if (!isOpen) {
    return null;
  }

  // Using key to reset form state when asset changes
  return <EditAssetForm key={asset.id} asset={asset} onClose={onClose} />;
}
