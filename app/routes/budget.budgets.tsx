import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, households, eq, parseHomeCurrency, type CurrencyCode } from "@amigo/db";
import { BudgetList } from "@/app/components/budget-list";
import { getBudgetsWithSpending } from "@/server/lib/budget-spending";
import { getHouseholdTimezone } from "@/server/lib/household-timezone";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [timeZone, household] = await Promise.all([
    getHouseholdTimezone(db, session.householdId),
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
  ]);

  const budgetsWithSpending = await getBudgetsWithSpending(db, {
    householdId: session.householdId,
    viewerUserId: session.userId,
    timeZone,
  });

  const homeCurrency = parseHomeCurrency(household?.homeCurrency);

  return {
    budgets: budgetsWithSpending.map((budget) => ({
      ...budget,
      currency: budget.currency as CurrencyCode,
      homeCurrency,
    })),
    homeCurrency,
    role: session.role,
  };
}

export default function Budgets() {
  const { budgets: budgetsData, role, homeCurrency } = useLoaderData<typeof loader>();

  return (
    <BudgetList
      budgets={budgetsData}
      session={{ role }}
      homeCurrency={homeCurrency}
    />
  );
}
