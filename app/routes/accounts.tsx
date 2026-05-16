import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import { getDb, financialAccounts, households, scopeToHousehold, eq, and, or, isNull, parseHomeCurrency } from "@amigo/db";
import { AccountCards } from "@/app/components/account-cards";
import { AddAccountDialog } from "@/app/components/add-account-dialog";
export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const items = await db.query.financialAccounts.findMany({
    where: and(
      scopeToHousehold(financialAccounts.householdId, session.householdId),
      or(eq(financialAccounts.userId, session.userId), isNull(financialAccounts.userId)),
      isNull(financialAccounts.deletedAt),
      eq(financialAccounts.archived, false)
    ),
    orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
  });

  return {
    accounts: items.map((a) => ({ ...a, isShared: a.userId === null })),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
  };
}

export default function AccountsPage() {
  const { accounts, homeCurrency } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Accounts
          </h1>
          <p className="mt-1 text-muted-foreground">
            Bank and cash accounts for imports and reconciliation
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all duration-200 active:scale-[0.97]"
        >
          Add account
        </button>
        <AddAccountDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          defaultCurrency={homeCurrency}
        />
      </div>
      <AccountCards accounts={accounts} />
    </main>
  );
}
