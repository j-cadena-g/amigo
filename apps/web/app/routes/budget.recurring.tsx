import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  recurringTransactions,
  households,
  scopeToHousehold,
  and,
  visibleRecurringRulesCondition,
  eq,
  isNull,
  parseHomeCurrency,
} from "@amigo/db";
import { RecurringList } from "@/app/components/recurring-list";
import { pageTitle } from "@/app/i18n";
import { getHouseholdTimezone } from "@/server/lib/household-timezone";

function dayOfWeekFromStartDate(startDate: string): number {
  return new Date(startDate + "T00:00:00").getDay();
}

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [household, timeZone] = await Promise.all([
    db.query.households.findFirst({ where: eq(households.id, session.householdId) }),
    getHouseholdTimezone(db, session.householdId),
  ]);

  const rules = await db.query.recurringTransactions.findMany({
    where: and(
      scopeToHousehold(recurringTransactions.householdId, session.householdId),
      visibleRecurringRulesCondition(session.userId),
      isNull(recurringTransactions.deletedAt)
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
    timeZone,
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.recurring);
}

export default function Recurring() {
  const { rules, homeCurrency, timeZone } = useLoaderData<typeof loader>();

  return <RecurringList rules={rules} homeCurrency={homeCurrency} timeZone={timeZone} />;
}
