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
import { AmountInput } from "@/app/components/amount-input";
import { CurrencySelect } from "@/app/components/currency-select";
import { NativeSelect, SharedCheckbox } from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { parseAmount } from "@/app/lib/decimal-input";
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
  const balanceId = useId();
  const currencyId = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTypeSelectValue>("CHECKING");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setType("CHECKING");
    setBalance("");
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
    const trimmed = balance.trim();
    let balanceNum = 0;
    if (trimmed !== "") {
      const parsed = parseAmount(trimmed);
      if (parsed === null) {
        setError(t.accounts.balanceInvalid);
        return;
      }
      balanceNum = parsed;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor={balanceId}>
                {t.common.balance}
              </label>
              <AmountInput
                id={balanceId}
                currency={currency}
                allowNegative
                value={balance}
                onValueChange={setBalance}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor={currencyId}>
                {t.common.currency}
              </label>
              <CurrencySelect
                id={currencyId}
                value={currency}
                onChange={(v) => setCurrency(v as CurrencyCode)}
              />
            </div>
          </div>
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
