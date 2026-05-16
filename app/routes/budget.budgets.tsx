import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, budgets, transactions, households, scopeToHousehold, eq, and, or, isNull, gte, lte, sql, sqlTransactionAmountHomeCents, parseHomeCurrency } from "@amigo/db";
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

function budgetAlertLevel(percentUsed: number, remainingHomeCents: number) {
  if (remainingHomeCents < 0 || percentUsed >= 100) return "over" as const;
  if (percentUsed >= 90) return "critical" as const;
  if (percentUsed >= 75) return "warn" as const;
  return "ok" as const;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const txnHome = sqlTransactionAmountHomeCents();

  const [userBudgets, household] = await Promise.all([
    db.query.budgets.findMany({
      where: and(
        scopeToHousehold(budgets.householdId, session.householdId),
        or(eq(budgets.userId, session.userId), isNull(budgets.userId)),
        isNull(budgets.deletedAt)
      ),
      orderBy: (budgets, { desc }) => [desc(budgets.createdAt)],
    }),
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
  ]);

  const homeCurrency = parseHomeCurrency(household?.homeCurrency);

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
        .select({ total: sql<number>`COALESCE(SUM(${txnHome}), 0)` })
        .from(transactions)
        .where(and(...baseConditions));

      const currentSpendingHomeCents = spendingResult[0]?.total ?? 0;
      const limitHomeCents = budget.limitAmountHome ?? budget.limitAmount;
      const percentUsed =
        limitHomeCents > 0 ? (currentSpendingHomeCents / limitHomeCents) * 100 : 0;
      const remainingHomeCents = limitHomeCents - currentSpendingHomeCents;

      return {
        ...budget,
        isShared,
        currentSpendingHomeCents,
        percentUsed,
        remainingHomeCents,
        homeCurrency,
        alertLevel: budgetAlertLevel(percentUsed, remainingHomeCents),
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
