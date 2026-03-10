import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, transactions, scopeToHousehold, eq, and, or, isNull, sql, desc } from "@amigo/db";
import { TransactionList } from "@/app/components/transaction-list";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const typeFilter = new URL(request.url).searchParams.get("type") as "income" | "expense" | null;

  const conditions = [
    scopeToHousehold(transactions.householdId, session.householdId),
    isNull(transactions.deletedAt),
    or(
      eq(transactions.userId, session.userId),
      sql`EXISTS (SELECT 1 FROM budgets WHERE budgets.id = ${transactions.budgetId} AND budgets.user_id IS NULL)`
    ),
  ];

  if (typeFilter === "income" || typeFilter === "expense") {
    conditions.push(eq(transactions.type, typeFilter));
  }

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
  };
}

export default function Transactions() {
  const { transactions: initialTransactions, userId, typeFilter } =
    useLoaderData<typeof loader>();

  return (
    <TransactionList
      initialTransactions={initialTransactions}
      currentUserId={userId}
      typeFilter={typeFilter}
    />
  );
}
