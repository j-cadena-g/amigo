import { db, eq, and, isNull, gte, lt, sql } from "../index";
import { transactions } from "../schema";

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
 * Fetch total spending for a household within a date range
 */
async function getTotalSpending(
  householdId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate)
      )
    );

  return parseFloat(result[0]?.total ?? "0");
}

/**
 * Fetch spending by category for a household within a date range
 */
async function getSpendingByCategory(
  householdId: string,
  startDate: Date,
  endDate: Date
): Promise<CategorySpending[]> {
  const result = await db
    .select({
      category: transactions.category,
      total: sql<string>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, startDate),
        lt(transactions.date, endDate)
      )
    )
    .groupBy(transactions.category);

  return result.map((row) => ({
    category: row.category,
    amount: parseFloat(row.total ?? "0"),
  }));
}

/**
 * Fetch budget analytics for the current month including comparison with last month
 *
 * This function aggregates transaction data by category and provides:
 * - Total spending for the current month
 * - Spending breakdown by category
 * - Month-over-month comparison data for bar charts
 */
export async function getBudgetAnalytics(
  householdId: string
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
    getTotalSpending(householdId, thisMonthBounds.start, thisMonthBounds.end),
    getSpendingByCategory(householdId, thisMonthBounds.start, thisMonthBounds.end),
    getSpendingByCategory(householdId, lastMonthBounds.start, lastMonthBounds.end),
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
 */
export async function getCategoryTrend(
  householdId: string,
  category: string,
  months: number = 6
): Promise<{ month: string; amount: number }[]> {
  const now = new Date();
  const results: { month: string; amount: number }[] = [];

  for (let i = 0; i < months; i++) {
    const targetMonth = now.getMonth() - i;
    const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;

    const bounds = getMonthBounds(targetYear, normalizedMonth);

    const result = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.type, "expense"),
          eq(transactions.category, category),
          isNull(transactions.deletedAt),
          gte(transactions.date, bounds.start),
          lt(transactions.date, bounds.end)
        )
      );

    const monthName = new Date(targetYear, normalizedMonth).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });

    results.unshift({
      month: monthName,
      amount: parseFloat(result[0]?.total ?? "0"),
    });
  }

  return results;
}
