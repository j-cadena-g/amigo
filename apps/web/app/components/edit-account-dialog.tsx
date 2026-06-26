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
import type { AccountRow } from "@/app/components/account-cards";
import type { CurrencyCode } from "@amigo/db";
import { getAccountTypeSelectOptions } from "@/app/lib/financial-account-types";

interface EditAccountDialogProps {
  account: AccountRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: EditAccountDialogProps) {
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [balance, setBalance] = useState((account.balance / 100).toFixed(2));
  const [currency, setCurrency] = useState<CurrencyCode>(account.currency as CurrencyCode);
  const [isShared, setIsShared] = useState(account.userId === null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeOptions = getAccountTypeSelectOptions(account.type);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (deleting) return;
    setError(null);
    const trimmed = balance.trim();
    let balanceNum = 0;
    if (trimmed !== "") {
      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        setError("Enter a valid balance.");
        return;
      }
      balanceNum = parsed;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          balance: balanceNum,
          currency,
          isShared,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to update account");
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
      title: "Delete account",
      description: "Remove this account? Linked transaction references are kept but the account will no longer appear in lists.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to delete account");
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
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Update balance, type, or sharing for this account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-acct-name">
              Name
            </label>
            <Input
              id="edit-acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-acct-type">
              Type
            </label>
            <select
              id="edit-acct-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {typeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-acct-bal">
                Balance
              </label>
              <Input
                id="edit-acct-bal"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-acct-cur">
                Currency
              </label>
              <select
                id="edit-acct-cur"
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
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="rounded border-input"
            />
            Shared (household-wide)
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              disabled={deleting || loading}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-4 w-4 mr-1 inline" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || deleting || !name.trim()}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
