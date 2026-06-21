import { Link } from "react-router";
import { Receipt, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";
import type { RecentTransaction } from "@/server/lib/dashboard-data";
import { formatRelativeDate } from "@/app/lib/format-dates";
import { getCategoryIcon } from "./utils";

interface DashboardRecentTransactionsProps {
  transactions: RecentTransaction[];
  todayStr: string;
}

export function DashboardRecentTransactions({
  transactions,
  todayStr,
}: DashboardRecentTransactionsProps) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
          <Link
            to="/financial"
            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No transactions yet
          </div>
        ) : (
          <div className="space-y-1">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50"
              >
                <span className="text-lg leading-none shrink-0">
                  {getCategoryIcon(t.category)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.description || t.category}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeDate(t.date, todayStr)}
                    {t.description ? ` · ${t.category}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums whitespace-nowrap",
                    t.type === "income"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {t.type === "income" ? "+" : "-"}
                  {formatCents(t.amount, t.currency as CurrencyCode)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
