import { useId, useState } from "react";
import { useRevalidator } from "react-router";
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
import { AccountAmountFields } from "@/app/components/account-amount-fields";
import { NativeSelect, SharedCheckbox } from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { parseAccountAmounts } from "@/app/lib/account-form";
import type { CurrencyCode } from "@amigo/db";
import {
  ACCOUNT_TYPE_SELECT_VALUES,
  type AccountTypeSelectValue,
} from "@/app/lib/financial-account-types";
import { useT } from "@/app/i18n";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: CurrencyCode;
}

export function AddAccountDialog({
  open,
  onOpenChange,
  defaultCurrency,
}: AddAccountDialogProps) {
  const t = useT();
  const revalidator = useRevalidator();
  const nameId = useId();
  const typeId = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTypeSelectValue>("CHECKING");
  const [amount, setAmount] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setType("CHECKING");
    setAmount("");
    setCreditLimit("");
    setOriginalAmount("");
    setCurrency(defaultCurrency);
    setIsShared(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const res = await fetch("/api/accounts", {
        method: "POST",
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
        setError((await readApiErrorMessage(res)) ?? t.common.couldNot(t.accounts.addAction));
        return;
      }
      revalidator.revalidate();
      resetForm();
      onOpenChange(false);
    } catch {
      setError(t.common.couldNotConnection(t.accounts.addAction));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.accounts.add}</DialogTitle>
          <DialogDescription>
            {t.accounts.addHint}
          </DialogDescription>
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
              placeholder={t.accounts.namePlaceholder}
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
              {ACCOUNT_TYPE_SELECT_VALUES.map((value) => (
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
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? t.common.adding : t.accounts.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
