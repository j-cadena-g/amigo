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
import { AccountAmountFields } from "@/app/components/account-amount-fields";
import {
  DeleteButton,
  NativeSelect,
  SharedCheckbox,
} from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { parseAccountAmounts } from "@/app/lib/account-form";
import { centsToInputString } from "@/app/lib/decimal-input";
import type { AccountRow } from "@/app/components/account-cards";
import { isLiabilityAccountType, type CurrencyCode } from "@amigo/db";
import { getAccountTypeSelectValues } from "@/app/lib/financial-account-types";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

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
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const nameId = useId();
  const typeId = useId();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  // Cards are edited as available credit (limit + balance), loans as the amount owed.
  const [amount, setAmount] = useState(() => {
    if (account.type === "CREDIT") {
      return account.creditLimit == null
        ? ""
        : centsToInputString(account.creditLimit + account.balance, account.currency, locale);
    }
    return centsToInputString(
      isLiabilityAccountType(account.type) ? -account.balance : account.balance,
      account.currency,
      locale
    );
  });
  const [creditLimit, setCreditLimit] = useState(
    account.creditLimit == null ? "" : centsToInputString(account.creditLimit, account.currency, locale)
  );
  const [originalAmount, setOriginalAmount] = useState(
    account.originalAmount == null
      ? ""
      : centsToInputString(account.originalAmount, account.currency, locale)
  );
  const [currency, setCurrency] = useState<CurrencyCode>(account.currency as CurrencyCode);
  const [isShared, setIsShared] = useState(account.userId === null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeOptions = getAccountTypeSelectValues(account.type);
  const isArchived = account.archived === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (deleting || archiving) return;
    setError(null);
    const amounts = parseAccountAmounts(type, { amount, creditLimit, originalAmount });
    if ("error" in amounts) {
      setError(
        amounts.error === "amount"
          ? t.accounts.balanceInvalid
          : amounts.error === "available"
            ? t.accounts.availableInvalid
            : t.accounts.amountInvalid
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          ...amounts,
          currency,
          isShared,
        }),
      });
      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.accounts.saveAction));
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.accounts.saveAction));
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveToggle() {
    const nextArchived = !isArchived;
    const ok = await confirm({
      title: nextArchived ? t.accounts.archiveTitle : t.accounts.restoreTitle,
      description: nextArchived ? t.accounts.archiveBody : t.accounts.restoreBody,
      confirmText: nextArchived ? t.accounts.archive : t.accounts.restore,
    });
    if (!ok) return;

    const action = nextArchived ? t.accounts.archiveAction : t.accounts.restoreAction;
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/archived`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(action));
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(action));
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t.accounts.deleteTitle,
      description: t.accounts.deleteBody,
      confirmText: t.common.delete,
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.accounts.deleteAction));
        return;
      }
      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.accounts.deleteAction));
    } finally {
      setDeleting(false);
    }
  }

  const busy = deleting || loading || archiving;
  const archiveLabel = archiving
    ? isArchived
      ? t.accounts.restoring
      : t.accounts.archiving
    : isArchived
      ? t.accounts.restore
      : t.accounts.archive;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isArchived ? t.accounts.editArchived : t.accounts.edit}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={nameId}>
              {t.common.name}
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
              {t.common.type}
            </label>
            <NativeSelect
              id={typeId}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {typeOptions.map((value) => (
                <option key={value} value={value}>
                  {t.accounts.types[value]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <AccountAmountFields
            type={type}
            currency={currency}
            onCurrencyChange={setCurrency}
            amount={amount}
            onAmountChange={setAmount}
            creditLimit={creditLimit}
            onCreditLimitChange={setCreditLimit}
            originalAmount={originalAmount}
            onOriginalAmountChange={setOriginalAmount}
          />
          <SharedCheckbox checked={isShared} onCheckedChange={setIsShared} />

          <AuditHistoryPanel recordId={account.id} table="financial_accounts" />

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <div className="flex flex-col-reverse gap-2 sm:mr-auto sm:flex-row">
              <DeleteButton disabled={busy} onClick={() => void handleDelete()}>
                <Trash2 />
                {deleting ? t.common.deleting : t.common.delete}
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
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {loading ? t.common.saving : t.accounts.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
