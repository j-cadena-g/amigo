import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  PiggyBank,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Landmark,
} from "lucide-react";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  transactions,
  groceryItems,
  budgets,
  recurringTransactions,
  assets,
  financialAccounts,
  debts,
  scopeToHousehold,
  eq,
  ne,
  and,
  or,
  isNull,
  isNotNull,
  gte,
  lte,
  desc,
  asc,
  sql,
  inArray,
  parseHomeCurrency,
} from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import { BudgetCharts } from "@/app/components/budget-charts";
import {
  Calendar,
  type CalendarEvent,
} from "@/app/components/calendar";
import type { CurrencyCode } from "@amigo/db";
import {
  sqlAssetBalanceHomeCents,
  sqlFinancialAccountBalanceHomeCents,
  sqlDebtLiabilityHomeCents,
  sqlTransactionAmountHomeCents,
} from "@/server/lib/money";
import {
  visibleBudgetsCondition,
  visibleFinancialTransactionsCondition,
  visibleRecurringRulesCondition,
} from "@/server/lib/financial-visibility";
import { getExchangeRateForRecord } from "@/server/lib/exchange-rates";

interface BudgetWithSpending {
  id: string;
  name: string;
  spentHomeCents: number;
  limitHomeCents: number;
  limitOriginalCents: number;
  budgetCurrency: string;
  period: string;
  recurringImpactHomeCents: number;
}

interface RecentTransaction {
  id: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  date: string;
}

interface UpcomingRecurring {
  id: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  frequency: string;
  nextRunDate: string;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0]!;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0]!;
  const todayStr = now.toISOString().split("T")[0]!;
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .split("T")[0]!;
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    .toISOString()
    .split("T")[0]!;

  const txnVis = visibleFinancialTransactionsCondition(session.userId);
  const expenseVisibleBase = [
    scopeToHousehold(transactions.householdId, session.householdId),
    eq(transactions.type, "expense"),
    isNull(transactions.deletedAt),
    txnVis,
  ];
  const incomeVisibleBase = [
    scopeToHousehold(transactions.householdId, session.householdId),
    eq(transactions.type, "income"),
    isNull(transactions.deletedAt),
    txnVis,
  ];

  const txnHome = sqlTransactionAmountHomeCents();

  // All queries in parallel
  const [
    spendingResult,
    incomeResult,
    groceryCountResult,
    recentTxns,
    budgetRows,
    upcomingRecurring,
    totalAssets,
    totalAccounts,
    totalDebts,
    household,
    categoryRows,
    lastMonthCategoryRows,
    calendarMonthTxns,
    calendarGroceriesByDate,
  ] = await Promise.all([
    // Monthly spending (home currency)
    db
      .select({ total: sql<number>`COALESCE(SUM(${txnHome}), 0)` })
      .from(transactions)
      .where(
        and(
          ...expenseVisibleBase,
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd)
        )
      ),
    // Monthly income (home currency)
    db
      .select({ total: sql<number>`COALESCE(SUM(${txnHome}), 0)` })
      .from(transactions)
      .where(
        and(
          ...incomeVisibleBase,
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd)
        )
      ),
    // Active grocery items
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session.householdId),
          eq(groceryItems.isPurchased, false),
          isNull(groceryItems.deletedAt)
        )
      ),
    // Recent 6 transactions
    db.query.transactions.findMany({
      where: and(
        scopeToHousehold(transactions.householdId, session.householdId),
        isNull(transactions.deletedAt),
        txnVis
      ),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 6,
    }),
    // Budgets with spending
    db
      .select({
        id: budgets.id,
        name: budgets.name,
        limitAmount: budgets.limitAmount,
        limitAmountHome: budgets.limitAmountHome,
        currency: budgets.currency,
        period: budgets.period,
        spent: sql<number>`COALESCE((
          SELECT SUM(${txnHome})
          FROM ${transactions}
          WHERE ${transactions.budgetId} = ${budgets.id}
            AND ${transactions.type} = 'expense'
            AND ${transactions.deletedAt} IS NULL
            AND ${transactions.date} >= ${monthStart}
            AND ${transactions.date} <= ${monthEnd}
        ), 0)`,
      })
      .from(budgets)
      .where(
        and(
          scopeToHousehold(budgets.householdId, session.householdId),
          isNull(budgets.deletedAt),
          visibleBudgetsCondition(session.userId)
        )
      )
      .limit(5),
    // Upcoming recurring (next 5)
    db.query.recurringTransactions.findMany({
      where: and(
        scopeToHousehold(
          recurringTransactions.householdId,
          session.householdId
        ),
        visibleRecurringRulesCondition(session.userId),
        eq(recurringTransactions.active, true),
        gte(recurringTransactions.nextRunDate, todayStr)
      ),
      orderBy: [asc(recurringTransactions.nextRunDate)],
      limit: 5,
    }),
    // Total assets (home currency)
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sqlAssetBalanceHomeCents()}), 0)`,
      })
      .from(assets)
      .where(
        and(
          scopeToHousehold(assets.householdId, session.householdId),
          or(eq(assets.userId, session.userId), isNull(assets.userId)),
          isNull(assets.deletedAt)
        )
      ),
    // Bank/cash accounts (home currency)
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sqlFinancialAccountBalanceHomeCents()}), 0)`,
      })
      .from(financialAccounts)
      .where(
        and(
          scopeToHousehold(financialAccounts.householdId, session.householdId),
          or(eq(financialAccounts.userId, session.userId), isNull(financialAccounts.userId)),
          isNull(financialAccounts.deletedAt),
          eq(financialAccounts.archived, false),
          ne(financialAccounts.type, "CREDIT")
        )
      ),
    // Total debts (home currency — liability amounts)
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sqlDebtLiabilityHomeCents()}), 0)`,
      })
      .from(debts)
      .where(
        and(
          scopeToHousehold(debts.householdId, session.householdId),
          or(eq(debts.userId, session.userId), isNull(debts.userId)),
          isNull(debts.deletedAt)
        )
      ),
    // Household
    db.query.households.findFirst({
      where: eq(
        (await import("@amigo/db")).households.id,
        session.householdId
      ),
    }),
    // This month's spending by category (for charts)
    db
      .select({
        category: transactions.category,
        amount: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          ...expenseVisibleBase,
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd)
        )
      )
      .groupBy(transactions.category),
    // Last month's spending by category (for comparison)
    db
      .select({
        category: transactions.category,
        amount: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          ...expenseVisibleBase,
          gte(transactions.date, lastMonthStart),
          lte(transactions.date, lastMonthEnd)
        )
      )
      .groupBy(transactions.category),
    // Calendar: transactions for current month
    db.query.transactions.findMany({
      where: and(
        scopeToHousehold(transactions.householdId, session.householdId),
        isNull(transactions.deletedAt),
        txnVis,
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd)
      ),
    }),
    // Calendar: grocery purchases grouped by date
    db
      .select({
        date: sql<string>`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(groceryItems)
      .where(
        and(
          scopeToHousehold(groceryItems.householdId, session.householdId),
          eq(groceryItems.isPurchased, true),
          isNotNull(groceryItems.purchasedAt),
          isNull(groceryItems.deletedAt),
          gte(
            sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
            monthStart
          ),
          lte(
            sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
            monthEnd
          )
        )
      )
      .groupBy(sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`),
  ]);

  const calendarEvents: CalendarEvent[] = [];
  for (const t of calendarMonthTxns) {
    calendarEvents.push({
      id: t.id,
      date: t.date,
      type: "transaction",
      title: t.description || t.category,
      color: t.type === "income" ? "green" : "red",
      metadata: {
        amount: t.amount,
        currency: t.currency,
        transactionType: t.type as "income" | "expense",
      },
    });
  }
  for (const g of calendarGroceriesByDate) {
    calendarEvents.push({
      id: `grocery-${g.date}`,
      date: g.date,
      type: "grocery_purchase",
      title: `${g.count} item${g.count !== 1 ? "s" : ""} purchased`,
      color: "orange",
      metadata: {
        itemCount: g.count,
      },
    });
  }
  const calendarMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const spendingCents = spendingResult[0]?.total ?? 0;
  const incomeCents = incomeResult[0]?.total ?? 0;
  const groceryCount = groceryCountResult[0]?.count ?? 0;
  const netCents = incomeCents - spendingCents;
  const currency = parseHomeCurrency(household?.homeCurrency);
  const monthName = now.toLocaleString("default", { month: "long" });
  const assetsCents =
    (totalAssets[0]?.total ?? 0) + (totalAccounts[0]?.total ?? 0);
  const debtsCents = totalDebts[0]?.total ?? 0;
  const netWorthCents = assetsCents - debtsCents;

  // Chart data
  const categoryData = categoryRows
    .filter((r) => r.amount > 0)
    .map((r) => ({ category: r.category ?? "Uncategorized", amount: r.amount }));

  const lastMonthMap = new Map(
    lastMonthCategoryRows.map((r) => [r.category ?? "Uncategorized", r.amount])
  );
  const allCategories = new Set([
    ...categoryData.map((d) => d.category),
    ...lastMonthCategoryRows.map((r) => r.category ?? "Uncategorized"),
  ]);
  const monthlyComparison = [...allCategories].map((category) => ({
    category,
    thisMonth: categoryData.find((d) => d.category === category)?.amount ?? 0,
    lastMonth: lastMonthMap.get(category) ?? 0,
  }));

  const recurringImpactByBudget = new Map<string, number>();
  const budgetIdsForImpact = budgetRows.map((b) => b.id);
  if (budgetIdsForImpact.length > 0) {
    const rules = await db.query.recurringTransactions.findMany({
      where: and(
        scopeToHousehold(recurringTransactions.householdId, session.householdId),
        visibleRecurringRulesCondition(session.userId),
        eq(recurringTransactions.active, true),
        eq(recurringTransactions.type, "expense"),
        inArray(recurringTransactions.budgetId, budgetIdsForImpact),
        gte(recurringTransactions.nextRunDate, monthStart),
        lte(recurringTransactions.nextRunDate, monthEnd)
      ),
    });
    const distinctCurrencies = [...new Set(rules.map((r) => r.currency))].filter(
      (c) => c !== currency
    );
    const rateByCurrency = new Map<string, number>();
    await Promise.all(
      distinctCurrencies.map(async (c) => {
        const rt = await getExchangeRateForRecord(env, c, currency);
        if (rt === null) {
          console.warn(
            `[dashboard] missing exchange rate ${c} -> ${currency}; skipping recurring rules in ${c}`
          );
          return;
        }
        rateByCurrency.set(c, rt);
      })
    );
    for (const r of rules) {
      if (!r.budgetId) continue;
      const mult =
        r.currency === currency ? 1 : rateByCurrency.get(r.currency);
      if (mult === undefined) continue;
      const homeAmt = Math.round(r.amount * mult);
      recurringImpactByBudget.set(
        r.budgetId,
        (recurringImpactByBudget.get(r.budgetId) ?? 0) + homeAmt
      );
    }
  }

  return {
    spendingCents,
    incomeCents,
    netCents,
    groceryCount,
    currency,
    monthName,
    year: now.getFullYear(),
    recentTransactions: recentTxns.map((t) => ({
      id: t.id,
      description: t.description,
      category: t.category,
      amount: t.amount,
      currency: t.currency,
      type: t.type as "income" | "expense",
      date: t.date,
    })) as RecentTransaction[],
    budgetsWithSpending: budgetRows.map((b) => ({
      id: b.id,
      name: b.name,
      spentHomeCents: b.spent,
      limitHomeCents: b.limitAmountHome,
      limitOriginalCents: b.limitAmount,
      budgetCurrency: b.currency,
      period: b.period,
      recurringImpactHomeCents: recurringImpactByBudget.get(b.id) ?? 0,
    })) as BudgetWithSpending[],
    upcomingRecurring: upcomingRecurring.map((r) => ({
      id: r.id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      type: r.type as "income" | "expense",
      frequency: r.frequency,
      nextRunDate: r.nextRunDate,
    })) as UpcomingRecurring[],
    assetsCents,
    debtsCents,
    netWorthCents,
    categoryData,
    monthlyComparison: monthlyComparison.length > 0 ? monthlyComparison : undefined,
    calendarEvents,
    calendarMonth,
  };
}

const CATEGORY_ICONS: Record<string, string> = {
  food: "🍕",
  groceries: "🛒",
  transport: "🚗",
  entertainment: "🎬",
  utilities: "💡",
  housing: "🏠",
  health: "🏥",
  shopping: "🛍️",
  salary: "💰",
  freelance: "💻",
  investment: "📈",
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] ?? "📋";
}

function formatRelativeDate(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const {
    spendingCents,
    incomeCents,
    netCents,
    groceryCount,
    currency,
    monthName,
    year,
    recentTransactions,
    budgetsWithSpending,
    upcomingRecurring,
    assetsCents,
    debtsCents,
    netWorthCents,
    categoryData,
    monthlyComparison,
    calendarEvents,
    calendarMonth,
  } = useLoaderData<typeof loader>();

  const cur = currency as CurrencyCode;

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          {monthName} {year} — your household at a glance
        </p>
      </div>

      {/* Stat cards — top row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger-in mb-6">
        {/* Spending */}
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
                {formatCents(spendingCents, cur)}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
            </CardContent>
          </Card>
        </Link>

        {/* Income */}
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
                {formatCents(incomeCents, cur)}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{monthName}</p>
            </CardContent>
          </Card>
        </Link>

        {/* Net */}
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
                {formatCents(netCents, cur)}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {netCents >= 0 ? "Looking good" : "In the red"}
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Groceries */}
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
              <p className="mt-0.5 text-xs text-muted-foreground">
                Active items
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Activity calendar */}
      <section className="mb-6 animate-fade-in" aria-label="Monthly activity">
        <Calendar
          compact
          initialEvents={calendarEvents}
          initialMonth={calendarMonth}
        />
      </section>

      {/* Main content — 2 column layout */}
      <div className="grid gap-4 lg:grid-cols-5 animate-stagger-in">
        {/* Left column — Recent transactions (wider) */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <Link
                to="/budget"
                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No transactions yet
              </div>
            ) : (
              <div className="space-y-1">
                {recentTransactions.map((t) => (
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
                        {formatRelativeDate(t.date)}
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

        {/* Right column — Budget progress */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Budget Progress</CardTitle>
              <Link
                to="/budget/budgets"
                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                Manage
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {budgetsWithSpending.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <PiggyBank className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No budgets set up
              </div>
            ) : (
              <div className="space-y-3">
                {budgetsWithSpending.map((b) => {
                  const pct = b.limitHomeCents > 0
                    ? Math.min(100, Math.round((b.spentHomeCents / b.limitHomeCents) * 100))
                    : 0;
                  const isOver = b.spentHomeCents > b.limitHomeCents;
                  const isCritical = !isOver && pct >= 90;
                  const isWarn = !isOver && pct >= 75 && pct < 90;
                  const budgetCur = b.budgetCurrency as CurrencyCode;
                  const showOriginal = budgetCur !== cur;
                  const projectedSpend = b.spentHomeCents + b.recurringImpactHomeCents;
                  const projectedPct =
                    b.limitHomeCents > 0
                      ? Math.round((projectedSpend / b.limitHomeCents) * 100)
                      : 0;

                  return (
                    <div key={b.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium truncate">
                          {b.name}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap ml-2">
                          {formatCents(b.spentHomeCents, cur)} /{" "}
                          {formatCents(b.limitHomeCents, cur)}
                        </span>
                      </div>
                      {showOriginal && (
                        <p className="text-[10px] text-muted-foreground mb-1">
                          Limit in budget currency:{" "}
                          {formatCents(b.limitOriginalCents, budgetCur)}
                        </p>
                      )}
                      <div
                        className={cn(
                          "budget-progress",
                          isOver || isCritical
                            ? "budget-progress--danger"
                            : isWarn
                              ? "budget-progress--warn"
                              : "budget-progress--default"
                        )}
                        role="progressbar"
                        aria-valuenow={Math.min(pct, 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="budget-progress__fill"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
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
                          {formatCents(b.recurringImpactHomeCents, cur)}
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
      </div>

      {/* Bottom row — Upcoming recurring + Net worth */}
      <div className="grid gap-4 lg:grid-cols-5 mt-4 animate-stagger-in">
        {/* Upcoming recurring */}
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
            {upcomingRecurring.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No upcoming recurring transactions
              </div>
            ) : (
              <div className="space-y-1">
                {upcomingRecurring.map((r) => (
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
                        {formatRelativeDate(r.nextRunDate)} ·{" "}
                        <span className="capitalize">
                          {r.frequency.toLowerCase()}
                        </span>
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

        {/* Net worth summary */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 dark:from-violet-500/10 dark:to-indigo-500/10 pointer-events-none" />
          <CardHeader className="relative pb-2">
            <CardTitle className="text-base">Net Worth</CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <div className="text-center py-2">
              <div
                className={cn(
                  "font-display text-3xl font-bold tracking-tight",
                  netWorthCents < 0 && "text-red-500 dark:text-red-400"
                )}
              >
                {formatCents(netWorthCents, cur)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total net worth
              </p>
            </div>

            <div className="space-y-2.5">
              <Link
                to="/financial"
                className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Assets</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCents(assetsCents, cur)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              <Link
                to="/financial/debts"
                className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/50 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Debts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-red-500 dark:text-red-400">
                    {formatCents(debtsCents, cur)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spending charts */}
      {categoryData.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <BudgetCharts
            categoryData={categoryData}
            monthlyComparison={monthlyComparison}
            currency={cur}
          />
        </div>
      )}
    </main>
  );
}
