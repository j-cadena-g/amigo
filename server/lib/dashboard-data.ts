import {
  transactions,
  groceryItems,
  households,
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
  type CurrencyCode,
  type DrizzleD1,
} from "@amigo/db";
import {
  sqlAssetBalanceHomeCents,
  sqlFinancialAccountBalanceHomeCents,
  sqlDebtLiabilityHomeCents,
  sqlTransactionAmountHomeCents,
} from "./money";
import {
  visibleFinancialTransactionsCondition,
  visibleRecurringRulesCondition,
} from "./financial-visibility";
import { getExchangeRateForRecord } from "./exchange-rates";
import { getBudgetsWithSpending } from "./budget-spending";
import { monthBoundsInTz, todayInTz } from "./dates";
import { getHouseholdTimezone } from "./household-timezone";
import type { Env } from "../env";

export interface BudgetWithSpending {
  id: string;
  name: string;
  spentHomeCents: number;
  limitHomeCents: number;
  limitOriginalCents: number;
  budgetCurrency: string;
  period: string;
  recurringImpactHomeCents: number;
}

export interface RecentTransaction {
  id: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  date: string;
}

export interface UpcomingRecurring {
  id: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  frequency: string;
  nextRunDate: string;
}

export interface DashboardCalendarEvent {
  id: string;
  date: string;
  type: "transaction" | "grocery_purchase";
  title: string;
  color: "green" | "red" | "orange";
  metadata?: {
    amount?: number;
    currency?: string;
    transactionType?: "income" | "expense";
    itemCount?: number;
  };
}

export interface DashboardData {
  spendingCents: number;
  incomeCents: number;
  netCents: number;
  groceryCount: number;
  currency: CurrencyCode;
  monthName: string;
  year: number;
  recentTransactions: RecentTransaction[];
  budgetsWithSpending: BudgetWithSpending[];
  upcomingRecurring: UpcomingRecurring[];
  assetsCents: number;
  debtsCents: number;
  netWorthCents: number;
  categoryData: { category: string; amount: number }[];
  monthlyComparison:
    | { category: string; thisMonth: number; lastMonth: number }[]
    | undefined;
  calendarEvents: DashboardCalendarEvent[];
  calendarMonth: string;
  todayStr: string;
}

export async function loadDashboardData(
  db: DrizzleD1,
  env: Env,
  session: { householdId: string; userId: string }
): Promise<DashboardData> {
  const now = new Date();
  const timeZone = await getHouseholdTimezone(db, session.householdId);
  const { start: monthStart, end: monthEnd } = monthBoundsInTz(now, timeZone);
  const todayStr = todayInTz(timeZone, now);
  const monthStartYear = Number(monthStart.slice(0, 4));
  const monthStartMonth = Number(monthStart.slice(5, 7));
  const previousMonthInstant = new Date(
    Date.UTC(monthStartYear, monthStartMonth - 2, 15, 12)
  );
  const { start: lastMonthStart, end: lastMonthEnd } = monthBoundsInTz(
    previousMonthInstant,
    timeZone
  );

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

  const [
    spendingResult,
    incomeResult,
    groceryCountResult,
    recentTxns,
    allBudgetsWithSpending,
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
    db.query.transactions.findMany({
      where: and(
        scopeToHousehold(transactions.householdId, session.householdId),
        isNull(transactions.deletedAt),
        txnVis
      ),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 6,
    }),
    getBudgetsWithSpending(db, {
      householdId: session.householdId,
      viewerUserId: session.userId,
      timeZone,
    }),
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
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
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
    db.query.transactions.findMany({
      where: and(
        scopeToHousehold(transactions.householdId, session.householdId),
        isNull(transactions.deletedAt),
        txnVis,
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd)
      ),
    }),
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

  const calendarEvents: DashboardCalendarEvent[] = [];
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
  const calendarMonth = monthStart.slice(0, 7);
  const dashboardYear = Number(monthStart.slice(0, 4));
  const dashboardMonthIndex = Number(monthStart.slice(5, 7)) - 1;

  const spendingCents = spendingResult[0]?.total ?? 0;
  const incomeCents = incomeResult[0]?.total ?? 0;
  const groceryCount = groceryCountResult[0]?.count ?? 0;
  const netCents = incomeCents - spendingCents;
  const currency = parseHomeCurrency(household?.homeCurrency);
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(
    new Date(Date.UTC(dashboardYear, dashboardMonthIndex, 15))
  );
  const assetsCents =
    (totalAssets[0]?.total ?? 0) + (totalAccounts[0]?.total ?? 0);
  const debtsCents = totalDebts[0]?.total ?? 0;
  const netWorthCents = assetsCents - debtsCents;

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
  const budgetRows = allBudgetsWithSpending.slice(0, 5);
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
        try {
          const rt = await getExchangeRateForRecord(env, c, currency);
          if (rt == null) return;
          rateByCurrency.set(c, rt);
        } catch {
          console.warn(
            `[dashboard] exchange rate lookup failed ${c} -> ${currency}; skipping recurring rules in ${c}`
          );
        }
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
    year: dashboardYear,
    recentTransactions: recentTxns.map((t) => ({
      id: t.id,
      description: t.description,
      category: t.category,
      amount: t.amount,
      currency: t.currency,
      type: t.type as "income" | "expense",
      date: t.date,
    })),
    budgetsWithSpending: budgetRows.map((b) => ({
      id: b.id,
      name: b.name,
      spentHomeCents: b.currentSpendingHomeCents,
      limitHomeCents: b.limitAmountHome,
      limitOriginalCents: b.limitAmount,
      budgetCurrency: b.currency,
      period: b.period,
      recurringImpactHomeCents: recurringImpactByBudget.get(b.id) ?? 0,
    })),
    upcomingRecurring: upcomingRecurring.map((r) => ({
      id: r.id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      type: r.type as "income" | "expense",
      frequency: r.frequency,
      nextRunDate: r.nextRunDate,
    })),
    assetsCents,
    debtsCents,
    netWorthCents,
    categoryData,
    monthlyComparison: monthlyComparison.length > 0 ? monthlyComparison : undefined,
    calendarEvents,
    calendarMonth,
    todayStr,
  };
}
