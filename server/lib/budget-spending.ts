import {
  and,
  budgets,
  eq,
  isNull,
  or,
  scopeToHousehold,
  sql,
  transactions,
  type DrizzleD1,
} from "@amigo/db";
import { sqlTransactionAmountHomeCents } from "./money";
import {
  budgetAlertLevel,
  computePercentUsed,
  computeRemainingHomeCents,
  legacyRemainingAmount,
} from "./budget-math";
import { getPeriodBounds } from "./dates";

export type BudgetWithSpendingRow = {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  category: string | null;
  limitAmount: number;
  limitAmountHome: number;
  exchangeRateLimitToHome: number | null;
  currency: string;
  period: "weekly" | "monthly" | "yearly";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  isShared: boolean;
  currentSpending: number;
  currentSpendingHomeCents: number;
  percentUsed: number;
  remainingHomeCents: number;
  remainingAmount: number;
  alertLevel: ReturnType<typeof budgetAlertLevel>;
};

export async function getBudgetsWithSpending(
  db: DrizzleD1,
  options: {
    householdId: string;
    viewerUserId: string;
    timeZone?: string;
    legacyRemaining?: boolean;
    orderBy?: "createdAt" | "category";
  }
): Promise<BudgetWithSpendingRow[]> {
  const timeZone = options.timeZone ?? "UTC";
  const weekly = getPeriodBounds("weekly", new Date(), timeZone);
  const monthly = getPeriodBounds("monthly", new Date(), timeZone);
  const yearly = getPeriodBounds("yearly", new Date(), timeZone);

  const userBudgets = await db.query.budgets.findMany({
    where: and(
      scopeToHousehold(budgets.householdId, options.householdId),
      or(eq(budgets.userId, options.viewerUserId), isNull(budgets.userId)),
      isNull(budgets.deletedAt)
    ),
    orderBy: (budget, { desc, asc }) =>
      options.orderBy === "category"
        ? [asc(budget.category)]
        : [desc(budget.createdAt)],
  });

  if (userBudgets.length === 0) {
    return [];
  }

  const txnHome = sqlTransactionAmountHomeCents();
  const spendingRows = await db
    .select({
      budgetId: transactions.budgetId,
      total: sql<number>`COALESCE(SUM(${txnHome}), 0)`,
    })
    .from(transactions)
    .innerJoin(budgets, eq(transactions.budgetId, budgets.id))
    .where(
      and(
        scopeToHousehold(transactions.householdId, options.householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        or(eq(budgets.userId, options.viewerUserId), isNull(budgets.userId)),
        isNull(budgets.deletedAt),
        sql`(
          (${budgets.period} = 'weekly' AND ${transactions.date} >= ${weekly.start} AND ${transactions.date} <= ${weekly.end})
          OR (${budgets.period} = 'monthly' AND ${transactions.date} >= ${monthly.start} AND ${transactions.date} <= ${monthly.end})
          OR (${budgets.period} = 'yearly' AND ${transactions.date} >= ${yearly.start} AND ${transactions.date} <= ${yearly.end})
        )`,
        sql`(${budgets.userId} IS NULL OR ${transactions.userId} = ${budgets.userId})`
      )
    )
    .groupBy(transactions.budgetId);

  const spendingByBudgetId = new Map(
    spendingRows.map((row) => [row.budgetId, row.total ?? 0])
  );

  return userBudgets.map((budget) => {
    const isShared = budget.userId === null;
    const currentSpendingHomeCents = spendingByBudgetId.get(budget.id) ?? 0;
    const limitHomeCents = budget.limitAmountHome;
    const percentUsed = computePercentUsed(currentSpendingHomeCents, limitHomeCents);
    const remainingHomeCents = computeRemainingHomeCents(
      limitHomeCents,
      currentSpendingHomeCents
    );
    const remainingAmount = options.legacyRemaining
      ? legacyRemainingAmount(remainingHomeCents)
      : remainingHomeCents;

    return {
      ...budget,
      isShared,
      currentSpending: currentSpendingHomeCents,
      currentSpendingHomeCents,
      percentUsed,
      remainingHomeCents,
      remainingAmount,
      alertLevel: budgetAlertLevel(percentUsed, remainingHomeCents),
    };
  });
}

export { getPeriodBounds } from "./dates";
