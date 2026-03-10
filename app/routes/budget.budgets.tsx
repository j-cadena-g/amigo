import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, budgets, transactions, scopeToHousehold, eq, and, or, isNull, gte, lte, sql } from "@amigo/db";
import { BudgetList } from "@/app/components/budget-list";

function getPeriodBounds(period: string): { start: string; end: string } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case "weekly": {
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      break;
    }
    case "monthly": {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    }
    case "yearly": {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      break;
    }
    default: {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
  }

  return {
    start: startDate.toISOString().split("T")[0]!,
    end: endDate.toISOString().split("T")[0]!,
  };
}

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const userBudgets = await db.query.budgets.findMany({
    where: and(
      scopeToHousehold(budgets.householdId, session.householdId),
      or(eq(budgets.userId, session.userId), isNull(budgets.userId)),
      isNull(budgets.deletedAt)
    ),
    orderBy: (budgets, { desc }) => [desc(budgets.createdAt)],
  });

  const budgetsWithSpending = await Promise.all(
    userBudgets.map(async (budget) => {
      const { start, end } = getPeriodBounds(budget.period);
      const isShared = budget.userId === null;

      const baseConditions = [
        eq(transactions.budgetId, budget.id),
        scopeToHousehold(transactions.householdId, session.householdId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ];

      if (!isShared && budget.userId) {
        baseConditions.push(eq(transactions.userId, budget.userId));
      }

      const spendingResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(and(...baseConditions));

      const currentSpendingCents = spendingResult[0]?.total ?? 0;
      const limitCents = budget.limitAmount;
      const percentUsed = limitCents > 0 ? (currentSpendingCents / limitCents) * 100 : 0;
      const remainingCents = Math.max(0, limitCents - currentSpendingCents);

      return {
        ...budget,
        isShared,
        currentSpending: currentSpendingCents,
        percentUsed,
        remainingAmount: remainingCents,
      };
    })
  );

  return {
    budgets: budgetsWithSpending,
    role: session.role,
  };
}

export default function Budgets() {
  const { budgets: budgetsData, role } = useLoaderData<typeof loader>();

  return (
    <BudgetList
      budgets={budgetsData}
      session={{ role }}
    />
  );
}
