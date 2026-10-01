import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  transactions,
  financialAccounts,
  households,
  scopeToHousehold,
  eq,
  and,
  isNull,
  desc,
  parseHomeCurrency,
  visibleFinancialAccountsCondition,
} from "@amigo/db";
import { visibleFinancialTransactionsCondition } from "@/server/lib/financial-visibility";
import { todayInTz } from "@/server/lib/dates";
import { getHouseholdTimezone } from "@/server/lib/household-timezone";
import { TransactionList } from "@/app/components/transaction-list";
import { pageTitle } from "@/app/i18n";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const searchParams = new URL(request.url).searchParams;
  const typeFilter = searchParams.get("type") as "income" | "expense" | null;
  const accountFilter = searchParams.get("account") || null;

  const conditions = [
    scopeToHousehold(transactions.householdId, session.householdId),
    isNull(transactions.deletedAt),
    visibleFinancialTransactionsCondition(session.userId),
  ];

  if (typeFilter === "income" || typeFilter === "expense") {
    conditions.push(eq(transactions.type, typeFilter));
  }

  if (accountFilter) {
    conditions.push(eq(transactions.accountId, accountFilter));
  }

  const [household, timeZone] = await Promise.all([
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
    getHouseholdTimezone(db, session.householdId),
  ]);
  const todayStr = todayInTz(timeZone);

  const [items, accounts] = await Promise.all([
    db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 20,
    }),
    // Archived included: a row keeps naming the account it was tagged to.
    db
      .select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        type: financialAccounts.type,
        archived: financialAccounts.archived,
      })
      .from(financialAccounts)
      .where(
        and(
          scopeToHousehold(financialAccounts.householdId, session.householdId),
          isNull(financialAccounts.deletedAt),
          visibleFinancialAccountsCondition(session.userId)
        )
      ),
  ]);

  const mapped = items.map((t) => ({
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.getTime() : Number(t.createdAt),
  }));

  return {
    transactions: mapped,
    userId: session.userId,
    typeFilter: typeFilter === "income" || typeFilter === "expense" ? typeFilter : null,
    accountFilter,
    accounts,
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
    todayStr,
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.transactions);
}

export default function Transactions() {
  const {
    transactions: initialTransactions,
    userId,
    typeFilter,
    accountFilter,
    accounts,
    homeCurrency,
    todayStr,
  } = useLoaderData<typeof loader>();

  return (
    <TransactionList
      initialTransactions={initialTransactions}
      currentUserId={userId}
      typeFilter={typeFilter}
      accountFilter={accountFilter}
      accounts={accounts}
      homeCurrency={homeCurrency}
      todayStr={todayStr}
    />
  );
}
