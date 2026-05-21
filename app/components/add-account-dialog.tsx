import { useState } from "react";
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
import { SUPPORTED_CURRENCIES } from "@/app/lib/currency";
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
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTypeSelectValue>("CHECKING");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to add account");
      }
      revalidator.revalidate();
      setName("");
      setType("CHECKING");
      setBalance("");
      setCurrency(defaultCurrency);
      setIsShared(false);
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setError(null);
          setName("");
          setType("CHECKING");
          setBalance("");
          setCurrency(defaultCurrency);
          setIsShared(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
          <DialogDescription>
            Track bank accounts, investments, and property. Transactions and CSV imports
            link to checking, savings, and cash. Add credit cards under Debts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="acct-name">
              Name
            </label>
            <Input
              id="acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main checking"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="acct-type">
              Type
            </label>
            <select
              id="acct-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {ACCOUNT_TYPE_SELECT_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="acct-bal">
                Balance
              </label>
              <Input
                id="acct-bal"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="acct-cur">
                Currency
              </label>
              <select
                id="acct-cur"
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
