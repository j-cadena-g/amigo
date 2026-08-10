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
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { AccountRow } from "@/app/components/account-cards";
import type { CurrencyCode } from "@amigo/db";
import { getAccountTypeSelectOptions } from "@/app/lib/financial-account-types";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";

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
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeOptions = getAccountTypeSelectOptions(account.type);
  const isArchived = account.archived === true;

  function parseBalanceInput(): number | null {
    const trimmed = balance.trim();
    if (trimmed === "") return 0;
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      setError("Enter a valid balance.");
      return null;
    }
    return parsed;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (deleting || archiving) return;
    setError(null);
    const balanceNum = parseBalanceInput();
    if (balanceNum === null) return;
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

  async function handleArchiveToggle() {
    const nextArchived = !isArchived;
    const ok = await confirm({
      title: nextArchived ? "Archive account" : "Restore account",
      description: nextArchived
        ? "Archive this account? It will disappear from lists but stay available for history and can be restored later."
        : "Restore this account to your active holdings list?",
      confirmText: nextArchived ? "Archive" : "Restore",
      variant: nextArchived ? "destructive" : "default",
    });
    if (!ok) return;

    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/archived`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to update archive status");
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete account",
      description:
        "Remove this account? Linked transaction references are kept but the account will no longer appear in lists.",
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

  const busy = deleting || loading || archiving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>
            Update balance, type, or sharing for this account.
            {isArchived ? " This account is archived." : ""}
          </DialogDescription>
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

          <AuditHistoryPanel recordId={account.id} table="financial_accounts" />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap gap-2 sm:mr-auto">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleArchiveToggle()}
              >
                {isArchived ? (
                  <ArchiveRestore className="mr-1 inline h-4 w-4" />
                ) : (
                  <Archive className="mr-1 inline h-4 w-4" />
                )}
                {archiving
                  ? isArchived
                    ? "Restoring…"
                    : "Archiving…"
                  : isArchived
                    ? "Restore"
                    : "Archive"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="mr-1 inline h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
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
