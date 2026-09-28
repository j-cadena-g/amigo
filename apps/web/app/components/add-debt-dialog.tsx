import { useId, useState } from "react";
import { useRevalidator } from "react-router";
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
import { SharedCheckbox } from "@/app/components/financial/form-controls";
import { TypeToggle } from "@/app/components/type-toggle";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { parseAmount } from "@/app/lib/decimal-input";
import { debtAccountBody } from "@/app/lib/debt-accounts";
import type { CurrencyCode } from "@amigo/db";
import { useT } from "@/app/i18n";

type DebtKind = "LOAN" | "CREDIT_CARD";


interface AddDebtDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency?: CurrencyCode;
}

export function AddDebtDialog({
  open,
  onOpenChange,
  defaultCurrency = "CAD",
}: AddDebtDialogProps) {
  const t = useT();
  const revalidator = useRevalidator();
  const nameId = useId();
  const currencyId = useId();
  const firstAmountId = useId();
  const secondAmountId = useId();
  const [kind, setKind] = useState<DebtKind>("LOAN");

  // Loan fields
  const [loanName, setLoanName] = useState("");
  const [loanCurrency, setLoanCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [loanAmount, setLoanAmount] = useState("");
  const [totalPaid, setTotalPaid] = useState("");

  // Credit card fields
  const [ccName, setCcName] = useState("");
  const [ccCurrency, setCcCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [creditLimit, setCreditLimit] = useState("");
  const [availableCredit, setAvailableCredit] = useState("");

  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        kind === "LOAN"
          ? debtAccountBody({
              kind,
              name: loanName,
              initial: parseAmount(loanAmount) ?? 0,
              current: parseAmount(totalPaid) ?? 0,
              currency: loanCurrency,
              isShared,
            })
          : debtAccountBody({
              kind,
              name: ccName,
              initial: parseAmount(creditLimit) ?? 0,
              current: parseAmount(availableCredit) ?? 0,
              currency: ccCurrency,
              isShared,
            });

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.debts.addAction[kind]));
        return;
      }

      revalidator.revalidate();
      resetForm();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.debts.addAction[kind]));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setLoanName("");
    setLoanCurrency(defaultCurrency);
    setLoanAmount("");
    setTotalPaid("");
    setCcName("");
    setCcCurrency(defaultCurrency);
    setCreditLimit("");
    setAvailableCredit("");
    setIsShared(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const currentName = kind === "LOAN" ? loanName : ccName;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t.debts.add}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TypeToggle
            label={t.debts.typeLabel}
            options={[
              { value: "LOAN", label: t.debts.kinds.LOAN },
              { value: "CREDIT_CARD", label: t.debts.kinds.CREDIT_CARD },
            ] as const}
            value={kind}
            onChange={setKind}
          />

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              {t.common.name}
            </label>
            {kind === "LOAN" ? (
              <Input
                key="loan-name"
                id={nameId}
                value={loanName}
                onChange={(e) => setLoanName(e.target.value)}
                placeholder={t.debts.loanPlaceholder}
                required
              />
            ) : (
              <Input
                key="cc-name"
                id={nameId}
                value={ccName}
                onChange={(e) => setCcName(e.target.value)}
                placeholder={t.debts.cardPlaceholder}
                required
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={currencyId} className="text-sm font-semibold">
              {t.common.currency}
            </label>
            <CurrencySelect
              id={currencyId}
              value={kind === "LOAN" ? loanCurrency : ccCurrency}
              onChange={(v) =>
                kind === "LOAN"
                  ? setLoanCurrency(v as CurrencyCode)
                  : setCcCurrency(v as CurrencyCode)
              }
            />
          </div>

          {kind === "LOAN" ? (
            <div key="loan-amounts" className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={firstAmountId} className="text-sm font-semibold">
                  {t.debts.loanAmount}
                </label>
                <AmountInput
                  id={firstAmountId}
                  currency={loanCurrency}
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
                  currency={loanCurrency}
                  max={parseAmount(loanAmount) ?? undefined}
                  value={totalPaid}
                  onValueChange={setTotalPaid}
                  required
                />
              </div>
            </div>
          ) : (
            <div key="cc-amounts" className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={firstAmountId} className="text-sm font-semibold">
                  {t.debts.creditLimit}
                </label>
                <AmountInput
                  id={firstAmountId}
                  currency={ccCurrency}
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
                  currency={ccCurrency}
                  value={availableCredit}
                  onValueChange={setAvailableCredit}
                  required
                />
              </div>
            </div>
          )}

          <SharedCheckbox checked={isShared} onCheckedChange={setIsShared} />

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={loading || !currentName.trim()}>
              {loading ? t.common.adding : t.debts.addKind[kind]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
