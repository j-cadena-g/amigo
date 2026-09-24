import type { CurrencyCode } from "@amigo/db";
import type { BudgetWithSpending } from "@/server/lib/dashboard-data";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import { LedgerSection, SectionLink } from "@/app/components/ledger";

interface DashboardBudgetProgressProps {
  budgets: BudgetWithSpending[];
  currency: CurrencyCode;
  className?: string;
}

export function DashboardBudgetProgress({
  budgets,
  currency,
  className,
}: DashboardBudgetProgressProps) {
  return (
    <LedgerSection
      title="Budgets"
      aside={<SectionLink to="/financial/budgets">Manage</SectionLink>}
      className={className}
    >
      {budgets.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No budgets yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {budgets.map((b) => {
            const ratio =
              b.limitHomeCents > 0
                ? (b.spentHomeCents / b.limitHomeCents) * 100
                : b.spentHomeCents > 0
                  ? 100
                  : 0;
            const pct = Math.min(100, Math.round(ratio));
            const remaining = b.limitHomeCents - b.spentHomeCents;
            const isOver = remaining < 0;
            const isNear = !isOver && ratio >= 75;
            const budgetCur = b.budgetCurrency as CurrencyCode;
            const projectedPct =
              b.limitHomeCents > 0
                ? Math.round(
                    ((b.spentHomeCents + b.recurringImpactHomeCents) / b.limitHomeCents) * 100
                  )
                : 0;

            return (
              <li key={b.id} className="py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate font-semibold">{b.name}</span>
                  <span className="shrink-0 font-mono text-sm font-medium text-muted-foreground">
                    {formatCents(b.spentHomeCents, currency)} of{" "}
                    {formatCents(b.limitHomeCents, currency)}
                  </span>
                </div>
                <progress
                  className={cn(
                    "budget-progress mt-2",
                    isOver
                      ? "budget-progress--danger"
                      : isNear
                        ? "budget-progress--warn"
                        : "budget-progress--default"
                  )}
                  value={Math.min(pct, 100)}
                  max={100}
                  aria-label={
                    isOver ? `${b.name}: over budget` : `${b.name}: ${pct}% of budget used`
                  }
                />
                <p className="mt-1.5 flex justify-between gap-4 text-sm">
                  <span
                    className={cn(
                      "font-mono font-medium",
                      isOver
                        ? "text-destructive"
                        : isNear
                          ? "text-warning"
                          : "text-muted-foreground"
                    )}
                  >
                    {isOver
                      ? `${formatCents(-remaining, currency)} over`
                      : `${formatCents(remaining, currency)} left`}
                  </span>
                  <span className="text-muted-foreground capitalize">{b.period}</span>
                </p>
                {budgetCur !== currency && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Limit in budget currency:{" "}
                    <span className="font-mono font-medium">
                      {formatCents(b.limitOriginalCents, budgetCur)}
                    </span>
                  </p>
                )}
                {b.recurringImpactHomeCents > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upcoming recurring (est.):{" "}
                    <span className="font-mono font-medium">
                      {formatCents(b.recurringImpactHomeCents, currency)}
                    </span>
                    {projectedPct > 100 && (
                      <span className="font-semibold text-warning">
                        {" "}
                        — with recurring, ~{projectedPct}% of limit
                      </span>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </LedgerSection>
  );
}
