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
import { ArrowRightLeft, Trash2 } from "lucide-react";
import type { Asset } from "@/app/components/asset-cards";
import type { CurrencyCode, FinancialAccount } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import {
  BANK_CONVERSION_ACCOUNT_TYPES,
  mapLegacyAssetTypeToAccountType,
  type LegacyAssetType,
} from "@/app/lib/legacy-asset-migration";

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
  const [accountType, setAccountType] = useState<FinancialAccount["type"]>(() =>
    mapLegacyAssetTypeToAccountType(asset.type as LegacyAssetType)
  );
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || deleting || converting;
  const parsedBalance = Number(balance);
  const balanceInCents = parsedBalance * 100;
  const hasInvalidBalance =
    balance.trim() === "" ||
    !Number.isFinite(parsedBalance) ||
    parsedBalance < 0 ||
    Math.abs(balanceInCents - Math.round(balanceInCents)) > 1e-8;
  const hasUnsavedChanges =
    name.trim() !== asset.name ||
    type !== asset.type ||
    hasInvalidBalance ||
    Math.round(balanceInCents) !== asset.balance ||
    currency !== asset.currency ||
    isShared !== (asset.userId === null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
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

  async function handleConvert() {
    if (busy) return;
    if (hasUnsavedChanges) {
      setError("Save your changes before you convert this asset.");
      return;
    }

    setConverting(true);
    setError(null);

    const ok = await confirm({
      title: "Convert to account",
      description:
        "Create a matching account from this legacy asset, then delete the legacy entry. Balances are copied; transactions were never linked to legacy assets.",
      confirmText: "Convert",
    });
    if (!ok) {
      setConverting(false);
      return;
    }

    try {
      // Convert from persisted asset values; only accountType is a convert-time choice (BANK).
      const res = await fetch(`/api/assets/${asset.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType:
            asset.type === "BANK"
              ? accountType
              : mapLegacyAssetTypeToAccountType(asset.type as LegacyAssetType),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Failed to convert asset");
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setConverting(false);
    }
  }

  async function handleDelete() {
    if (busy) return;

    setDeleting(true);
    setError(null);

    const ok = await confirm({
      title: "Delete Asset",
      description: "Are you sure you want to delete this asset? This action cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) {
      setDeleting(false);
      return;
    }

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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Asset</DialogTitle>
          <DialogDescription>
            Update this legacy asset, convert it to an account, or delete it.
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
              onChange={(e) => {
                const next = e.target.value as typeof type;
                setType(next);
                setAccountType(mapLegacyAssetTypeToAccountType(next as LegacyAssetType));
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {type === "BANK" && (
            <div className="space-y-2">
              <label htmlFor="convert-account-type" className="text-sm font-medium">
                Convert as
              </label>
              <select
                id="convert-account-type"
                value={accountType}
                onChange={(e) => {
                  const next = e.target.value;
                  const match = BANK_CONVERSION_ACCOUNT_TYPES.find(
                    (t) => t.value === next
                  );
                  if (match) setAccountType(match.value);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {BANK_CONVERSION_ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          <AuditHistoryPanel recordId={asset.id} table="assets" />

          {hasUnsavedChanges ? (
            <p className="text-sm text-muted-foreground">
              Save your changes before converting this asset.
            </p>
          ) : null}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap gap-2 sm:mr-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleConvert()}
                disabled={busy || !name.trim() || hasUnsavedChanges}
              >
                <ArrowRightLeft className="mr-1 h-4 w-4" />
                {converting ? "Converting…" : "Convert to account"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
