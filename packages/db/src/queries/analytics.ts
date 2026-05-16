import { db, eq, and, isNull, gte, lt, sql } from "../index";
import { transactions } from "../schema";
import { sqlTransactionAmountHomeCents } from "../sql-money";
import { visibleFinancialTransactionsCondition } from "../financial-visibility";

export interface CategorySpending {
  category: string;
  amount: number;
  [key: string]: string | number;
}

export interface MonthlyComparison {
  category: string;
  thisMonth: number;
  lastMonth: number;
  [key: string]: string | number;
}

export interface BudgetAnalytics {
  totalSpending: number;
  categoryData: CategorySpending[];
  monthlyComparison: MonthlyComparison[];
}

/**
 * Get the start and end dates for a given month
 */
function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return { start, end };
}

/**
 * Fetch total spending for a user within a date range
 * Includes user's own transactions + transactions on shared budgets
 */
async function getTotalSpending(
  householdId: string,
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const txnHome = sqlTransactionAmountHomeCents();
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        visibleFinancialTransactionsCondition(userId)
      )
    );

  return result[0]?.total ?? 0;
}

/**
 * Fetch spending by category for a user within a date range
 * Includes user's own transactions + transactions on shared budgets
 */
async function getSpendingByCategory(
  householdId: string,
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CategorySpending[]> {
  const txnHome = sqlTransactionAmountHomeCents();
  const result = await db
    .select({
      category: transactions.category,
      total: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate),
        visibleFinancialTransactionsCondition(userId)
      )
    )
    .groupBy(transactions.category);

  return result.map((row) => ({
    category: row.category,
    amount: row.total ?? 0,
  }));
}

/**
 * Fetch budget analytics for the current month including comparison with last month
 *
 * This function aggregates transaction data by category and provides:
 * - Total spending for the current month
 * - Spending breakdown by category
 * - Month-over-month comparison data for bar charts
 *
 * Analytics are scoped to the user's visible transactions:
 * - User's own transactions
 * - Transactions linked to shared budgets
 */
export async function getBudgetAnalytics(
  householdId: string,
  userId: string
): Promise<BudgetAnalytics> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Calculate date bounds for current and previous month
  const thisMonthBounds = getMonthBounds(currentYear, currentMonth);
  const lastMonthBounds = getMonthBounds(
    currentMonth === 0 ? currentYear - 1 : currentYear,
    currentMonth === 0 ? 11 : currentMonth - 1
  );

  // Fetch data in parallel for better performance
  const [totalSpending, thisMonthData, lastMonthData] = await Promise.all([
    getTotalSpending(householdId, userId, thisMonthBounds.start, thisMonthBounds.end),
    getSpendingByCategory(householdId, userId, thisMonthBounds.start, thisMonthBounds.end),
    getSpendingByCategory(householdId, userId, lastMonthBounds.start, lastMonthBounds.end),
  ]);

  // Build category data (current month only)
  const categoryData = thisMonthData;

  // Build monthly comparison by merging both months' data
  const categorySet = new Set<string>();
  thisMonthData.forEach((item) => categorySet.add(item.category));
  lastMonthData.forEach((item) => categorySet.add(item.category));

  const thisMonthMap = new Map(thisMonthData.map((item) => [item.category, item.amount]));
  const lastMonthMap = new Map(lastMonthData.map((item) => [item.category, item.amount]));

  const monthlyComparison: MonthlyComparison[] = Array.from(categorySet)
    .map((category) => ({
      category,
      thisMonth: thisMonthMap.get(category) ?? 0,
      lastMonth: lastMonthMap.get(category) ?? 0,
    }))
    .sort((a, b) => b.thisMonth - a.thisMonth); // Sort by current month spending descending

  return {
    totalSpending,
    categoryData,
    monthlyComparison,
  };
}

/**
 * Get spending totals for a specific category over multiple months
 * Useful for trend analysis
 * Scoped to user's visible transactions
 */
export async function getCategoryTrend(
  householdId: string,
  userId: string,
  category: string,
  months: number = 6
): Promise<{ month: string; amount: number }[]> {
  const now = new Date();
  const results: { month: string; amount: number }[] = [];
  const txnHome = sqlTransactionAmountHomeCents();

  for (let i = 0; i < months; i++) {
    const targetMonth = now.getMonth() - i;
    const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;

    const bounds = getMonthBounds(targetYear, normalizedMonth);

    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.type, "expense"),
          eq(transactions.category, category),
          isNull(transactions.deletedAt),
          gte(transactions.date, bounds.start),
          lt(transactions.date, bounds.end),
          visibleFinancialTransactionsCondition(userId)
        )
      );

    const monthName = new Date(targetYear, normalizedMonth).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });

    results.unshift({
      month: monthName,
      amount: result[0]?.total ?? 0,
    });
  }

  return results;
}
