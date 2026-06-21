import { Link } from "react-router";
import { PiggyBank, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";
import type { BudgetWithSpending } from "@/server/lib/dashboard-data";

interface DashboardBudgetProgressProps {
  budgets: BudgetWithSpending[];
  currency: CurrencyCode;
}

export function DashboardBudgetProgress({
  budgets,
  currency,
}: DashboardBudgetProgressProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Budget Progress</CardTitle>
          <Link
            to="/financial/budgets"
            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            Manage
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {budgets.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <PiggyBank className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No budgets set up
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => {
              const pct =
                b.limitHomeCents > 0
                  ? Math.min(
                      100,
                      Math.round((b.spentHomeCents / b.limitHomeCents) * 100)
                    )
                  : b.spentHomeCents > 0
                    ? 100
                    : 0;
              const isOver = b.spentHomeCents > b.limitHomeCents;
              const isCritical = !isOver && pct >= 90;
              const isWarn = !isOver && pct >= 75 && pct < 90;
              const budgetCur = b.budgetCurrency as CurrencyCode;
              const showOriginal = budgetCur !== currency;
              const projectedSpend = b.spentHomeCents + b.recurringImpactHomeCents;
              const projectedPct =
                b.limitHomeCents > 0
                  ? Math.round((projectedSpend / b.limitHomeCents) * 100)
                  : 0;

              return (
                <div key={b.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium truncate">{b.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap ml-2">
                      {formatCents(b.spentHomeCents, currency)} /{" "}
                      {formatCents(b.limitHomeCents, currency)}
                    </span>
                  </div>
                  {showOriginal && (
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Limit in budget currency:{" "}
                      {formatCents(b.limitOriginalCents, budgetCur)}
                    </p>
                  )}
                  <progress
                    className={cn(
                      "budget-progress",
                      isOver || isCritical
                        ? "budget-progress--danger"
                        : isWarn
                          ? "budget-progress--warn"
                          : "budget-progress--default"
                    )}
                    value={Math.min(pct, 100)}
                    max={100}
                    aria-label={
                      isOver
                        ? `${b.name}: over budget`
                        : `${b.name}: ${pct}% of budget used`
                    }
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        isOver
                          ? "text-red-500"
                          : isCritical
                            ? "text-red-500"
                            : isWarn
                              ? "text-amber-500"
                              : "text-muted-foreground"
                      )}
                    >
                      {isOver
                        ? "Over budget"
                        : isCritical
                          ? "90%+ used"
                          : isWarn
                            ? "75%+ used"
                            : `${pct}% used`}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {b.period}
                    </span>
                  </div>
                  {b.recurringImpactHomeCents > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Upcoming recurring (est.):{" "}
                      {formatCents(b.recurringImpactHomeCents, currency)}
                      {projectedPct > 100 && (
                        <span className="text-amber-600 font-medium">
                          {" "}
                          — with recurring, ~{projectedPct}% of limit
                        </span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
