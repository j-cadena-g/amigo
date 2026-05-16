import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  transactions,
  households,
  scopeToHousehold,
  eq,
  and,
  isNull,
  desc,
  parseHomeCurrency,
} from "@amigo/db";
import { visibleFinancialTransactionsCondition } from "@/server/lib/financial-visibility";
import { TransactionList } from "@/app/components/transaction-list";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const typeFilter = new URL(request.url).searchParams.get("type") as "income" | "expense" | null;

  const conditions = [
    scopeToHousehold(transactions.householdId, session.householdId),
    isNull(transactions.deletedAt),
    visibleFinancialTransactionsCondition(session.userId),
  ];

  if (typeFilter === "income" || typeFilter === "expense") {
    conditions.push(eq(transactions.type, typeFilter));
  }

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const items = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 20,
  });

  const mapped = items.map((t) => ({
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.getTime() : Number(t.createdAt),
  }));

  return {
    transactions: mapped,
    userId: session.userId,
    typeFilter: typeFilter === "income" || typeFilter === "expense" ? typeFilter : null,
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
  };
}

export default function Transactions() {
  const { transactions: initialTransactions, userId, typeFilter, homeCurrency } =
    useLoaderData<typeof loader>();

  return (
    <TransactionList
      initialTransactions={initialTransactions}
      currentUserId={userId}
      typeFilter={typeFilter}
      homeCurrency={homeCurrency}
    />
  );
}
