import { Link } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import type { CurrencyCode } from "@amigo/db";

interface DashboardStatCardsProps {
  spendingCents: number;
  incomeCents: number;
  netCents: number;
  groceryCount: number;
  currency: CurrencyCode;
  monthName: string;
}

export function DashboardStatCards({
  spendingCents,
  incomeCents,
  netCents,
  groceryCount,
  currency,
  monthName,
}: DashboardStatCardsProps) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger-in mb-6">
      <Link to="/budget?type=expense" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-orange-500/10 dark:from-red-500/20 dark:to-orange-500/20 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Spending
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-red-500 dark:text-red-400">
                <ArrowDownRight className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {formatCents(spendingCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/budget?type=income" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Income
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {formatCents(incomeCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/budget" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Net
              </span>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-background/80",
                  netCents >= 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-red-500 dark:text-red-400"
                )}
              >
                {netCents >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
              </div>
            </div>
            <div
              className={cn(
                "font-display text-xl font-bold tracking-tight md:text-2xl",
                netCents < 0 && "text-red-500 dark:text-red-400"
              )}
            >
              {netCents >= 0 ? "+" : ""}
              {formatCents(netCents, currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {netCents >= 0 ? "Looking good" : "In the red"}
            </p>
          </CardContent>
        </Card>
      </Link>

      <Link to="/groceries" className="block">
        <Card className="card-interactive overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 dark:from-amber-500/20 dark:to-yellow-500/20 pointer-events-none" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Groceries
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 text-amber-600 dark:text-amber-400">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
              {groceryCount}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Active items</p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
