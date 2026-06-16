import { Link } from "react-router";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";
import type { UpcomingRecurring } from "@/server/lib/dashboard-data";
import { formatRelativeDate } from "@/app/lib/format-dates";

interface DashboardUpcomingRecurringProps {
  items: UpcomingRecurring[];
  todayStr: string;
}

export function DashboardUpcomingRecurring({
  items,
  todayStr,
}: DashboardUpcomingRecurringProps) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Upcoming Recurring</CardTitle>
          <Link
            to="/budget/recurring"
            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No upcoming recurring transactions
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0",
                    r.type === "income"
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400"
                  )}
                >
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.description || r.category}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeDate(r.nextRunDate, todayStr)} ·{" "}
                    <span className="capitalize">{r.frequency.toLowerCase()}</span>
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums whitespace-nowrap",
                    r.type === "income"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {r.type === "income" ? "+" : "-"}
                  {formatCents(r.amount, r.currency as CurrencyCode)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
