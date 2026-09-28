import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  financialAccounts,
  households,
  LIABILITY_ACCOUNT_TYPES,
  scopeToHousehold,
  eq,
  and,
  or,
  inArray,
  isNull,
  parseHomeCurrency,
} from "@amigo/db";
import { Plus } from "lucide-react";
import { DebtCards } from "@/app/components/debt-cards";
import { AddDebtDialog } from "@/app/components/add-debt-dialog";
import { EmptyState } from "@/app/components/empty-state";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { Button } from "@/app/components/ui/button";
import { debtFromAccount } from "@/app/lib/debt-accounts";
import { pageTitle, useT } from "@/app/i18n";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [items, household] = await Promise.all([
    db.query.financialAccounts.findMany({
      where: and(
        scopeToHousehold(financialAccounts.householdId, session.householdId),
        or(eq(financialAccounts.userId, session.userId), isNull(financialAccounts.userId)),
        isNull(financialAccounts.deletedAt),
        eq(financialAccounts.archived, false),
        inArray(financialAccounts.type, [...LIABILITY_ACCOUNT_TYPES])
      ),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
  ]);

  return {
    debts: items.map(debtFromAccount),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
    userId: session.userId,
    role: session.role,
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.debts);
}

export default function FinancialDebts() {
  const t = useT();
  const { debts: debtData, homeCurrency, userId, role } =
    useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);
  const openAdd = () => setAddOpen(true);

  return (
    <div className="space-y-8">
      <FinancialSectionHeader
        title={t.nav.debts}
        action={
          <Button type="button" onClick={openAdd}>
            <Plus />
            {t.debts.add}
          </Button>
        }
      />
      {debtData.length === 0 ? (
        <EmptyState
          message={t.debts.empty}
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              {t.debts.add}
            </Button>
          }
        />
      ) : (
        <DebtCards
          debts={debtData}
          homeCurrency={homeCurrency}
          session={{ userId, role }}
        />
      )}
      <AddDebtDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCurrency={homeCurrency}
      />
    </div>
  );
}
