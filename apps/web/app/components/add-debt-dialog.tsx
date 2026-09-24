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
import { CurrencySelect } from "@/app/components/currency-select";
import { SharedCheckbox } from "@/app/components/financial/form-controls";
import { TypeToggle } from "@/app/components/type-toggle";
import { readApiErrorMessage } from "@/app/lib/api-error";
import type { CurrencyCode } from "@amigo/db";

type DebtKind = "LOAN" | "CREDIT_CARD";

const DEBT_KIND_OPTIONS = [
  { value: "LOAN", label: "Loan" },
  { value: "CREDIT_CARD", label: "Credit card" },
] as const;

const DEBT_KIND_NOUNS: Record<DebtKind, string> = {
  LOAN: "loan",
  CREDIT_CARD: "credit card",
};

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

  const noun = DEBT_KIND_NOUNS[kind];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        kind === "LOAN"
          ? {
              type: "LOAN" as const,
              name: loanName,
              loanAmount: parseFloat(loanAmount) || 0,
              totalPaid: parseFloat(totalPaid) || 0,
              currency: loanCurrency,
              isShared,
            }
          : {
              type: "CREDIT_CARD" as const,
              name: ccName,
              creditLimit: parseFloat(creditLimit) || 0,
              availableCredit: parseFloat(availableCredit) || 0,
              currency: ccCurrency,
              isShared,
            };

      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError((await readApiErrorMessage(res)) ?? `Couldn't add the ${noun}. Try again.`);
        return;
      }

      revalidator.revalidate();
      resetForm();
      onOpenChange(false);
    } catch {
      setError(`Couldn't add the ${noun}. Check your connection and try again.`);
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
          <DialogTitle>Add debt</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TypeToggle
            label="Debt type"
            options={DEBT_KIND_OPTIONS}
            value={kind}
            onChange={setKind}
          />

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Name
            </label>
            {kind === "LOAN" ? (
              <Input
                key="loan-name"
                id={nameId}
                value={loanName}
                onChange={(e) => setLoanName(e.target.value)}
                placeholder="e.g. Car loan"
                required
              />
            ) : (
              <Input
                key="cc-name"
                id={nameId}
                value={ccName}
                onChange={(e) => setCcName(e.target.value)}
                placeholder="e.g. Visa"
                required
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={currencyId} className="text-sm font-semibold">
              Currency
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
                  Loan amount
                </label>
                <Input
                  id={firstAmountId}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono font-medium"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={secondAmountId} className="text-sm font-semibold">
                  Total paid
                </label>
                <Input
                  id={secondAmountId}
                  type="number"
                  step="0.01"
                  min="0"
                  max={loanAmount || undefined}
                  value={totalPaid}
                  onChange={(e) => setTotalPaid(e.target.value)}
                  placeholder="0.00"
                  className="font-mono font-medium"
                  required
                />
              </div>
            </div>
          ) : (
            <div key="cc-amounts" className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={firstAmountId} className="text-sm font-semibold">
                  Credit limit
                </label>
                <Input
                  id={firstAmountId}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="0.00"
                  className="font-mono font-medium"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={secondAmountId} className="text-sm font-semibold">
                  Available credit
                </label>
                <Input
                  id={secondAmountId}
                  type="number"
                  step="0.01"
                  min="0"
                  value={availableCredit}
                  onChange={(e) => setAvailableCredit(e.target.value)}
                  placeholder="0.00"
                  className="font-mono font-medium"
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
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !currentName.trim()}>
              {loading ? "Adding…" : kind === "LOAN" ? "Add loan" : "Add credit card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
