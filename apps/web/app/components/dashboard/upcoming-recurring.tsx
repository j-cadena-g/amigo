import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
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
            to="/financial/recurring"
            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No recurring bills or pay scheduled.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 py-2.5"
              >
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
                      ? "text-success"
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
