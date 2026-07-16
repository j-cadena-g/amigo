import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { formatCents } from "@/app/lib/currency";
import { Pencil } from "lucide-react";
import { EditDebtDialog } from "@/app/components/edit-debt-dialog";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";
import { getCreditCardSummary } from "@/app/lib/credit-card-summary";

export interface Debt {
  id: string;
  name: string;
  type: "LOAN" | "CREDIT_CARD";
  /** For LOAN: loan amount in cents. For CREDIT_CARD: credit limit in cents. */
  balanceInitial: number;
  /** For LOAN: total paid in cents. For CREDIT_CARD: available credit in cents. */
  balanceCurrent: number;
  currency: CurrencyCode;
  exchangeRateToHome: number | null;
  userId: string | null;
  isShared?: boolean;
  createdAt: Date | number;
}

interface DebtCardsProps {
  debts: Debt[];
  homeCurrency: CurrencyCode;
  session: { userId: string; role: string };
}

function getCreditCardUtilizationColor(utilization: number) {
  if (utilization < 30) return "bg-green-500";
  if (utilization <= 70) return "bg-orange-500";
  return "bg-red-500";
}

export function DebtCards({ debts, homeCurrency, session: _session }: DebtCardsProps) {
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

  const creditCardSummary = getCreditCardSummary(debts);
  const shared = debts.filter((d) => d.isShared);
  const personal = debts.filter((d) => !d.isShared);

  function renderDebtGroup(items: Debt[]) {
    const loans = items.filter((d) => d.type === "LOAN");
    const creditCards = items.filter((d) => d.type === "CREDIT_CARD");
    return (
      <>
        {loans.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Loans ({loans.length})
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loans.map((debt) => (
                <LoanCard key={debt.id} debt={debt} onEdit={() => setEditingDebt(debt)} />
              ))}
            </div>
          </div>
        )}
        {creditCards.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Credit Cards ({creditCards.length})
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {creditCards.map((debt) => (
                <CreditCardCard key={debt.id} debt={debt} onEdit={() => setEditingDebt(debt)} />
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {creditCardSummary ? (
          <CreditCardSummary
            summary={creditCardSummary}
            homeCurrency={homeCurrency}
          />
        ) : null}
        {shared.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Shared</h2>
            {renderDebtGroup(shared)}
          </div>
        )}
        {personal.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Personal</h2>
            {renderDebtGroup(personal)}
          </div>
        )}
      </div>

      {editingDebt && (
        <EditDebtDialog
          debt={editingDebt}
          open={!!editingDebt}
          onOpenChange={(open) => {
            if (!open) setEditingDebt(null);
          }}
        />
      )}
    </>
  );
}

function CreditCardSummary({
  summary,
  homeCurrency,
}: {
  summary: NonNullable<ReturnType<typeof getCreditCardSummary>>;
  homeCurrency: CurrencyCode;
}) {
  const barWidth = Math.min(100, summary.percentageUsed);
  const barColor = getCreditCardUtilizationColor(summary.percentageUsed);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Available Credit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total available</p>
            <p className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCents(summary.availableCreditCents, homeCurrency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Used</p>
            <p className="text-lg font-semibold tabular-nums">
              {summary.percentageUsed.toFixed(0)}%
            </p>
          </div>
        </div>
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCents(summary.usedCreditCents, homeCurrency)} used of{" "}
            {formatCents(summary.totalLimitCents, homeCurrency)} across{" "}
            {summary.cardCount} {summary.cardCount === 1 ? "card" : "cards"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanCard({ debt, onEdit }: { debt: Debt; onEdit: () => void }) {
  const loanAmount = debt.balanceInitial;
  const totalPaid = debt.balanceCurrent;
  const remaining = loanAmount - totalPaid;
  const percentage = loanAmount > 0 ? (totalPaid / loanAmount) * 100 : 0;

  const barColor =
    percentage > 75
      ? "bg-green-500"
      : percentage >= 25
        ? "bg-orange-500"
        : "bg-red-500";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{debt.name}</CardTitle>
            {debt.isShared && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                Shared
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Loan Amount</p>
            <p className="font-medium tabular-nums">
              {formatCents(loanAmount, debt.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Paid</p>
            <p className="font-medium tabular-nums">
              {formatCents(totalPaid, debt.currency)}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium tabular-nums">
              {formatCents(Math.max(0, remaining), debt.currency)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {Math.min(100, percentage).toFixed(0)}% paid
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditCardCard({ debt, onEdit }: { debt: Debt; onEdit: () => void }) {
  const creditLimit = debt.balanceInitial;
  const availableCredit = debt.balanceCurrent;
  const usedAmount = creditLimit - availableCredit;
  const utilization = creditLimit > 0 ? (usedAmount / creditLimit) * 100 : 0;
  const barWidth = Math.max(0, Math.min(100, utilization));
  const barColor = getCreditCardUtilizationColor(utilization);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{debt.name}</CardTitle>
            <div className="flex gap-1.5">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                Credit Card
              </span>
              {debt.isShared && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                  Shared
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Credit Limit</p>
            <p className="font-medium tabular-nums">
              {formatCents(creditLimit, debt.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Available</p>
            <p className="font-medium tabular-nums">
              {formatCents(availableCredit, debt.currency)}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {usedAmount < 0 ? "Unused Credit" : "Used"}
            </span>
            <span className="font-medium tabular-nums">
              {formatCents(Math.abs(usedAmount), debt.currency)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {Math.max(0, utilization).toFixed(0)}% utilization
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
