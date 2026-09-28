import { useId, useState } from "react";
import { useRevalidator } from "react-router";
import { Trash2 } from "lucide-react";
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
import { AmountInput } from "@/app/components/amount-input";
import { CurrencySelect } from "@/app/components/currency-select";
import { DeleteButton, SharedCheckbox } from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { centsToInputString, parseAmount } from "@/app/lib/decimal-input";
import { debtAccountBody } from "@/app/lib/debt-accounts";
import type { Debt } from "@/app/components/debt-cards";
import type { CurrencyCode } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

interface EditDebtDialogProps {
  debt: Debt;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDebtDialog({ debt, open, onOpenChange }: EditDebtDialogProps) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const nameId = useId();
  const currencyId = useId();
  const firstAmountId = useId();
  const secondAmountId = useId();
  const [name, setName] = useState(debt.name);
  const [currency, setCurrency] = useState<CurrencyCode>(debt.currency);
  const [isShared, setIsShared] = useState(debt.userId === null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLoan = debt.type === "LOAN";
  const kind = isLoan ? "LOAN" : "CREDIT_CARD";

  // Loan fields
  const [loanAmount, setLoanAmount] = useState(
    isLoan ? centsToInputString(debt.balanceInitial, debt.currency, locale) : ""
  );
  const [totalPaid, setTotalPaid] = useState(
    isLoan ? centsToInputString(debt.balanceCurrent, debt.currency, locale) : ""
  );

  // Credit card fields
  const [creditLimit, setCreditLimit] = useState(
    debt.type === "CREDIT_CARD" ? centsToInputString(debt.balanceInitial, debt.currency, locale) : ""
  );
  const [availableCredit, setAvailableCredit] = useState(
    debt.type === "CREDIT_CARD" ? centsToInputString(debt.balanceCurrent, debt.currency, locale) : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body = isLoan
        ? debtAccountBody({
            kind,
            name,
            initial: parseAmount(loanAmount) ?? 0,
            current: parseAmount(totalPaid) ?? 0,
            currency,
            isShared,
          })
        : debtAccountBody({
            kind,
            name,
            initial: parseAmount(creditLimit) ?? 0,
            current: parseAmount(availableCredit) ?? 0,
            currency,
            isShared,
          });

      const res = await fetch(`/api/accounts/${debt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.debts.saveAction[kind]));
        return;
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.debts.saveAction[kind]));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t.debts.deleteTitle[kind],
      description: t.common.cantBeUndone,
      confirmText: t.common.delete,
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/accounts/${debt.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.debts.deleteAction[kind]));
        return;
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.debts.deleteAction[kind]));
    } finally {
      setDeleting(false);
    }
  }

  const busy = loading || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t.debts.editKind[kind]}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
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
            <label htmlFor={currencyId} className="text-sm font-semibold">
              {t.common.currency}
            </label>
            <CurrencySelect
              id={currencyId}
              value={currency}
              onChange={(v) => setCurrency(v as CurrencyCode)}
            />
          </div>

          {isLoan ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={firstAmountId} className="text-sm font-semibold">
                  {t.debts.loanAmount}
                </label>
                <AmountInput
                  id={firstAmountId}
                  currency={currency}
                  positive
                  value={loanAmount}
                  onValueChange={setLoanAmount}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={secondAmountId} className="text-sm font-semibold">
                  {t.debts.totalPaid}
                </label>
                <AmountInput
                  id={secondAmountId}
                  currency={currency}
                  max={parseAmount(loanAmount) ?? undefined}
                  value={totalPaid}
                  onValueChange={setTotalPaid}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={firstAmountId} className="text-sm font-semibold">
                  {t.debts.creditLimit}
                </label>
                <AmountInput
                  id={firstAmountId}
                  currency={currency}
                  positive
                  value={creditLimit}
                  onValueChange={setCreditLimit}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={secondAmountId} className="text-sm font-semibold">
                  {t.debts.availableCredit}
                </label>
                <AmountInput
                  id={secondAmountId}
                  currency={currency}
                  value={availableCredit}
                  onValueChange={setAvailableCredit}
                  required
                />
              </div>
            </div>
          )}

          <SharedCheckbox checked={isShared} onCheckedChange={setIsShared} />

          <AuditHistoryPanel recordId={debt.id} table="financial_accounts" />

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <DialogFooter>
            <DeleteButton onClick={() => void handleDelete()} disabled={busy} className="sm:mr-auto">
              <Trash2 />
              {deleting ? t.common.deleting : t.common.delete}
            </DeleteButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {loading ? t.common.saving : t.debts.saveKind[kind]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
