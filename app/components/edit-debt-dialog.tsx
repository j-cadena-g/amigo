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
import { Trash2 } from "lucide-react";
import type { Debt } from "@/app/components/debt-cards";
import type { CurrencyCode } from "@amigo/db";

interface EditDebtDialogProps {
  debt: Debt;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDebtDialog({ debt, open, onOpenChange }: EditDebtDialogProps) {
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const [name, setName] = useState(debt.name);
  const [currency, setCurrency] = useState<CurrencyCode>(debt.currency);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loan fields
  const [loanAmount, setLoanAmount] = useState(
    debt.type === "LOAN" ? (debt.balanceInitial / 100).toFixed(2) : ""
  );
  const [totalPaid, setTotalPaid] = useState(
    debt.type === "LOAN" ? (debt.balanceCurrent / 100).toFixed(2) : ""
  );

  // Credit card fields
  const [creditLimit, setCreditLimit] = useState(
    debt.type === "CREDIT_CARD" ? (debt.balanceInitial / 100).toFixed(2) : ""
  );
  const [availableCredit, setAvailableCredit] = useState(
    debt.type === "CREDIT_CARD" ? (debt.balanceCurrent / 100).toFixed(2) : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        debt.type === "LOAN"
          ? {
              type: "LOAN" as const,
              name,
              loanAmount: parseFloat(loanAmount) || 0,
              totalPaid: parseFloat(totalPaid) || 0,
              currency,
            }
          : {
              type: "CREDIT_CARD" as const,
              name,
              creditLimit: parseFloat(creditLimit) || 0,
              availableCredit: parseFloat(availableCredit) || 0,
              currency,
            };

      const res = await fetch(`/api/debts/${debt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to update debt");
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete Debt",
      description: "Are you sure you want to delete this debt? This action cannot be undone.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/debts/${debt.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to delete debt");
      }

      revalidator.revalidate();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {debt.type === "LOAN" ? "Loan" : "Credit Card"}</DialogTitle>
          <DialogDescription>
            Update the details of this {debt.type === "LOAN" ? "loan" : "credit card"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="edit-debt-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-debt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-debt-currency" className="text-sm font-medium">
              Currency
            </label>
            <select
              id="edit-debt-currency"
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

          {debt.type === "LOAN" ? (
            <>
              <div className="space-y-2">
                <label htmlFor="edit-loan-amount" className="text-sm font-medium">
                  Loan Amount
                </label>
                <Input
                  id="edit-loan-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-total-paid" className="text-sm font-medium">
                  Total Paid
                </label>
                <Input
                  id="edit-total-paid"
                  type="number"
                  step="0.01"
                  min="0"
                  max={loanAmount || undefined}
                  value={totalPaid}
                  onChange={(e) => setTotalPaid(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="edit-credit-limit" className="text-sm font-medium">
                  Credit Limit
                </label>
                <Input
                  id="edit-credit-limit"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-available-credit" className="text-sm font-medium">
                  Available Credit
                </label>
                <Input
                  id="edit-available-credit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={availableCredit}
                  onChange={(e) => setAvailableCredit(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || deleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || deleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || deleting || !name.trim()}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
