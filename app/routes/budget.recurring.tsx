import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, recurringTransactions, scopeToHousehold } from "@amigo/db";
import { RecurringList } from "@/app/components/recurring-list";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const rules = await db.query.recurringTransactions.findMany({
    where: scopeToHousehold(recurringTransactions.householdId, session.householdId),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  const mapped = rules.map((r) => ({
    ...r,
    isActive: r.active,
    dayOfWeek: null as number | null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
  }));

  return {
    rules: mapped,
    userId: session.userId,
  };
}

export default function Recurring() {
  const { rules, userId } = useLoaderData<typeof loader>();

  return (
    <RecurringList
      rules={rules}
      session={{ userId }}
    />
  );
}
