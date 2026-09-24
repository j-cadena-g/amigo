import { useId, useState } from "react";
import { useRevalidator } from "react-router";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
  const nameId = useId();
  const typeId = useId();
  const balanceId = useId();
  const currencyId = useId();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [balance, setBalance] = useState(centsToInputString(account.balance));
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
      setError("Enter the balance as a number, like 1250.00.");
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't save the account. Try again.");
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError("Couldn't save the account. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveToggle() {
    const nextArchived = !isArchived;
    const ok = await confirm({
      title: nextArchived ? "Archive account?" : "Restore account?",
      description: nextArchived
        ? "It leaves your lists but stays in history. You can restore it later."
        : "It goes back to your active accounts.",
      confirmText: nextArchived ? "Archive" : "Restore",
    });
    if (!ok) return;

    const verb = nextArchived ? "archive" : "restore";
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/archived`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? `Couldn't ${verb} the account. Try again.`);
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(`Couldn't ${verb} the account. Check your connection and try again.`);
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete account?",
      description:
        "Linked transactions keep their reference, but the account won't appear in lists anymore.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? "Couldn't delete the account. Try again.");
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError("Couldn't delete the account. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  const busy = deleting || loading || archiving;
  const archiveLabel = archiving
    ? isArchived
      ? "Restoring…"
      : "Archiving…"
    : isArchived
      ? "Restore"
      : "Archive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isArchived ? "Edit archived account" : "Edit account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={nameId}>
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
            <label className="text-sm font-semibold" htmlFor={typeId}>
              Type
            </label>
            <NativeSelect
              id={typeId}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {typeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor={balanceId}>
                Balance
              </label>
              <Input
                id={balanceId}
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="font-mono font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor={currencyId}>
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

          <AuditHistoryPanel recordId={account.id} table="financial_accounts" />

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <div className="flex flex-col-reverse gap-2 sm:mr-auto sm:flex-row">
              <DeleteButton disabled={busy} onClick={() => void handleDelete()}>
                <Trash2 />
                {deleting ? "Deleting…" : "Delete"}
              </DeleteButton>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void handleArchiveToggle()}
              >
                {isArchived ? <ArchiveRestore /> : <Archive />}
                {archiveLabel}
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
            <Button type="submit" disabled={busy || !name.trim()}>
              {loading ? "Saving…" : "Save account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
