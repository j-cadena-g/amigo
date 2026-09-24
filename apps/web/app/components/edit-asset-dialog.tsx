import { useId, useState } from "react";
import { useRevalidator } from "react-router";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { useConfirm } from "@/app/components/confirm-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { CurrencySelect } from "@/app/components/currency-select";
import {
  DeleteButton,
  NativeSelect,
  SharedCheckbox,
} from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { centsToInputString } from "@/app/lib/decimal-input";
import type { Asset } from "@/app/components/asset-cards";
import type { CurrencyCode, FinancialAccount } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import {
  BANK_CONVERSION_ACCOUNT_TYPES,
  mapLegacyAssetTypeToAccountType,
  type LegacyAssetType,
} from "@/app/lib/legacy-asset-migration";

const ASSET_TYPES = [
  { value: "BANK", label: "Bank account" },
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
  const nameId = useId();
  const typeId = useId();
  const convertTypeId = useId();
  const balanceId = useId();
  const currencyId = useId();
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [balance, setBalance] = useState(centsToInputString(asset.balance));
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
  const trimmedBalance = balance.trim();
  // Exact decimal shape (non-negative, ≤2 fraction digits) — avoids float tolerance gaps.
  const hasInvalidBalance = !/^\d+(\.\d{1,2})?$/.test(trimmedBalance);
  const parsedBalance = Number(trimmedBalance);
  const hasUnsavedChanges =
    name.trim() !== asset.name ||
    type !== asset.type ||
    hasInvalidBalance ||
    Math.round(parsedBalance * 100) !== asset.balance ||
    currency !== asset.currency ||
    isShared !== (asset.userId === null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (hasInvalidBalance) {
      setError("Enter a balance of 0 or more, with up to two decimal places.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          balance: Number(trimmedBalance),
          currency,
          isShared,
        }),
      });

      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? "Couldn't save the asset. Try again.");
        return;
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError("Couldn't save the asset. Check your connection and try again.");
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
      title: "Convert to account?",
      description:
        "This creates an account with the same balance and removes the legacy entry. Transactions were never linked to legacy assets, so none move.",
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't convert the asset. Try again.");
        return;
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError("Couldn't convert the asset. Check your connection and try again.");
    } finally {
      setConverting(false);
    }
  }

  async function handleDelete() {
    if (busy) return;

    setDeleting(true);
    setError(null);

    const ok = await confirm({
      title: "Delete asset?",
      description: "This can't be undone.",
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't delete the asset. Try again.");
        return;
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError("Couldn't delete the asset. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Edit legacy asset</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={typeId} className="text-sm font-semibold">
              Type
            </label>
            <NativeSelect
              id={typeId}
              value={type}
              onChange={(e) => {
                const next = e.target.value as typeof type;
                setType(next);
                setAccountType(mapLegacyAssetTypeToAccountType(next as LegacyAssetType));
              }}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {type === "BANK" && (
            <div className="space-y-1.5">
              <label htmlFor={convertTypeId} className="text-sm font-semibold">
                Convert as
              </label>
              <NativeSelect
                id={convertTypeId}
                value={accountType}
                onChange={(e) => {
                  const next = e.target.value;
                  const match = BANK_CONVERSION_ACCOUNT_TYPES.find(
                    (t) => t.value === next
                  );
                  if (match) setAccountType(match.value);
                }}
              >
                {BANK_CONVERSION_ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={balanceId} className="text-sm font-semibold">
                Balance
              </label>
              <Input
                id={balanceId}
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="font-mono font-medium"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={currencyId} className="text-sm font-semibold">
                Currency
              </label>
              <CurrencySelect
                id={currencyId}
                value={currency}
                onChange={(v) => setCurrency(v as CurrencyCode)}
              />
            </div>
          </div>

          <SharedCheckbox checked={isShared} onCheckedChange={setIsShared} />

          <AuditHistoryPanel recordId={asset.id} table="assets" />

          {hasUnsavedChanges ? (
            <p className="text-sm text-muted-foreground">
              Save your changes before converting this asset.
            </p>
          ) : null}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <DialogFooter>
            <div className="flex flex-col-reverse gap-2 sm:mr-auto sm:flex-row">
              <DeleteButton onClick={() => void handleDelete()} disabled={busy}>
                <Trash2 />
                {deleting ? "Deleting…" : "Delete"}
              </DeleteButton>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleConvert()}
                disabled={busy || !name.trim() || hasUnsavedChanges}
              >
                <ArrowRightLeft />
                {converting ? "Converting…" : "Convert to account"}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || hasInvalidBalance}>
              {loading ? "Saving…" : "Save asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
