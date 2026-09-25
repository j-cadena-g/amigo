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
import { CurrencySelect } from "@/app/components/currency-select";
import { NativeSelect, SharedCheckbox } from "@/app/components/financial/form-controls";
import { readApiErrorMessage } from "@/app/lib/api-error";
import type { CurrencyCode } from "@amigo/db";
import {
  ACCOUNT_TYPE_SELECT_OPTIONS,
  type AccountTypeSelectValue,
} from "@/app/lib/financial-account-types";

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
      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        setError("Enter the balance as a number, like 1250.00.");
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
        setError((await readApiErrorMessage(res)) ?? "Couldn't add the account. Try again.");
        return;
      }
      revalidator.revalidate();
      resetForm();
      onOpenChange(false);
    } catch {
      setError("Couldn't add the account. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
          <DialogDescription>
            Transactions and imports link to checking, savings, and cash accounts. Add
            credit cards under Debts.
          </DialogDescription>
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
              placeholder="e.g. Main checking"
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
              {ACCOUNT_TYPE_SELECT_OPTIONS.map((t) => (
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
                placeholder="0.00"
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
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? "Adding…" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
