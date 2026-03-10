import { useState } from "react";
import { useRevalidator } from "react-router";
import { useConfirm } from "@/app/components/confirm-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { SUPPORTED_CURRENCIES } from "@/app/lib/currency";
import { Trash2 } from "lucide-react";
import type { Asset } from "@/app/components/asset-cards";
import type { CurrencyCode } from "@amigo/db";

const ASSET_TYPES = [
  { value: "BANK", label: "Bank Account" },
  { value: "INVESTMENT", label: "Investment" },
  { value: "CASH", label: "Cash" },
  { value: "PROPERTY", label: "Property" },
] as const;

interface EditAssetDialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAssetDialog({ asset, open, onOpenChange }: EditAssetDialogProps) {
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [balance, setBalance] = useState((asset.balance / 100).toFixed(2));
  const [currency, setCurrency] = useState<CurrencyCode>(asset.currency);
  const [isShared, setIsShared] = useState(asset.userId === null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          balance: parseFloat(balance) || 0,
          currency,
          isShared,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to update asset");
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete Asset",
      description: "Are you sure you want to delete this asset? This action cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to delete asset");
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Asset</DialogTitle>
          <DialogDescription>
            Update the details of this asset.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="edit-asset-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-asset-type" className="text-sm font-medium">
              Type
            </label>
            <select
              id="edit-asset-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-asset-balance" className="text-sm font-medium">
              Balance
            </label>
            <Input
              id="edit-asset-balance"
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-asset-currency" className="text-sm font-medium">
              Currency
            </label>
            <select
              id="edit-asset-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-asset-shared"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="edit-asset-shared" className="text-sm font-medium">
              Shared (household-wide)
            </label>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || deleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || deleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || deleting || !name.trim()}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
