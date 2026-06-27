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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { SUPPORTED_CURRENCIES } from "@/app/lib/currency";
import type { CurrencyCode } from "@amigo/db";

interface AddDebtDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDebtDialog({ open, onOpenChange }: AddDebtDialogProps) {
  const revalidator = useRevalidator();
  const [tab, setTab] = useState<"LOAN" | "CREDIT_CARD">("LOAN");

  // Loan fields
  const [loanName, setLoanName] = useState("");
  const [loanCurrency, setLoanCurrency] = useState<CurrencyCode>("CAD");
  const [loanAmount, setLoanAmount] = useState("");
  const [totalPaid, setTotalPaid] = useState("");

  // Credit card fields
  const [ccName, setCcName] = useState("");
  const [ccCurrency, setCcCurrency] = useState<CurrencyCode>("CAD");
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
        tab === "LOAN"
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
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed to add debt");
      }

      revalidator.revalidate();
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setLoanName("");
    setLoanCurrency("CAD");
    setLoanAmount("");
    setTotalPaid("");
    setCcName("");
    setCcCurrency("CAD");
    setCreditLimit("");
    setAvailableCredit("");
    setIsShared(false);
    setError(null);
  }

  const currentName = tab === "LOAN" ? loanName : ccName;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Debt</DialogTitle>
          <DialogDescription>
            Track a loan or credit card to monitor your payoff progress.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "LOAN" | "CREDIT_CARD")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="LOAN" className="flex-1">
              Loan
            </TabsTrigger>
            <TabsTrigger value="CREDIT_CARD" className="flex-1">
              Credit Card
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <TabsContent value="LOAN" className="mt-0 space-y-4">
              <div className="space-y-2">
                <label htmlFor="loan-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="loan-name"
                  value={loanName}
                  onChange={(e) => setLoanName(e.target.value)}
                  placeholder="e.g. Car Loan"
                  required={tab === "LOAN"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="loan-currency" className="text-sm font-medium">
                  Currency
                </label>
                <select
                  id="loan-currency"
                  value={loanCurrency}
                  onChange={(e) => setLoanCurrency(e.target.value as CurrencyCode)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="loan-amount" className="text-sm font-medium">
                  Loan Amount
                </label>
                <Input
                  id="loan-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="0.00"
                  required={tab === "LOAN"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="total-paid" className="text-sm font-medium">
                  Total Paid
                </label>
                <Input
                  id="total-paid"
                  type="number"
                  step="0.01"
                  min="0"
                  max={loanAmount || undefined}
                  value={totalPaid}
                  onChange={(e) => setTotalPaid(e.target.value)}
                  placeholder="0.00"
                  required={tab === "LOAN"}
                />
              </div>
            </TabsContent>

            <TabsContent value="CREDIT_CARD" className="mt-0 space-y-4">
              <div className="space-y-2">
                <label htmlFor="cc-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="cc-name"
                  value={ccName}
                  onChange={(e) => setCcName(e.target.value)}
                  placeholder="e.g. Visa Platinum"
                  required={tab === "CREDIT_CARD"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="cc-currency" className="text-sm font-medium">
                  Currency
                </label>
                <select
                  id="cc-currency"
                  value={ccCurrency}
                  onChange={(e) => setCcCurrency(e.target.value as CurrencyCode)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="credit-limit" className="text-sm font-medium">
                  Credit Limit
                </label>
                <Input
                  id="credit-limit"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="0.00"
                  required={tab === "CREDIT_CARD"}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="available-credit" className="text-sm font-medium">
                  Available Credit
                </label>
                <Input
                  id="available-credit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={availableCredit}
                  onChange={(e) => setAvailableCredit(e.target.value)}
                  placeholder="0.00"
                  required={tab === "CREDIT_CARD"}
                />
              </div>
            </TabsContent>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="debt-shared"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="debt-shared" className="text-sm font-medium">
                Shared (household-wide)
              </label>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !currentName.trim()}>
                {loading ? "Adding..." : "Add Debt"}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
