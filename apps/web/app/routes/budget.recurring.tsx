import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  recurringTransactions,
  households,
  scopeToHousehold,
  and,
  visibleRecurringRulesCondition,
  eq,
  parseHomeCurrency,
} from "@amigo/db";
import { RecurringList } from "@/app/components/recurring-list";
import { FinancialCollapsiblePanel } from "@/app/components/financial/financial-collapsible-panel";
import { CategoryManagementPanel } from "@/app/components/financial/category-management-panel";

function dayOfWeekFromStartDate(startDate: string): number {
  return new Date(startDate + "T00:00:00").getDay();
}

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const rules = await db.query.recurringTransactions.findMany({
    where: and(
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      visibleRecurringRulesCondition(session.userId)
    ),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  const mapped = rules.map((r) => ({
    ...r,
    isActive: r.active,
    dayOfWeek:
      r.frequency === "WEEKLY" ? dayOfWeekFromStartDate(r.startDate) : null,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
  }));

  return {
    rules: mapped,
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
  };
}

export default function Recurring() {
  const { rules, homeCurrency } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Recurring transactions</h2>
        <p className="text-sm text-muted-foreground">
          Set up scheduled income or expenses that post automatically.
        </p>
      </div>

      <FinancialCollapsiblePanel
        title="Manage categories"
        description="Add, archive, and organize income and expense categories."
      >
        <CategoryManagementPanel />
      </FinancialCollapsiblePanel>

      <RecurringList rules={rules} homeCurrency={homeCurrency} />
    </div>
  );
}
