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
  isNull,
  notInArray,
  parseHomeCurrency,
} from "@amigo/db";
import { Plus } from "lucide-react";
import { AccountCards } from "@/app/components/account-cards";
import { AddAccountDialog } from "@/app/components/add-account-dialog";
import { EmptyState } from "@/app/components/empty-state";
import { FinancialSectionHeader } from "@/app/components/financial-section-header";
import { LedgerGroup } from "@/app/components/financial/ledger-group";
import {
  isAssetHoldingType,
  isTransactionalAccountType,
} from "@/app/lib/financial-account-types";
import { Button } from "@/app/components/ui/button";
import { pageTitle, useT } from "@/app/i18n";

export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session.householdId),
  });

  const householdScope = scopeToHousehold(
    financialAccounts.householdId,
    session.householdId
  );
  const visibility = or(
    eq(financialAccounts.userId, session.userId),
    isNull(financialAccounts.userId)
  );

  const [accountItems, archivedAccountItems] = await Promise.all([
    db.query.financialAccounts.findMany({
      where: and(
        householdScope,
        visibility,
        isNull(financialAccounts.deletedAt),
        eq(financialAccounts.archived, false),
        notInArray(financialAccounts.type, [...LIABILITY_ACCOUNT_TYPES])
      ),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
    db.query.financialAccounts.findMany({
      where: and(
        householdScope,
        visibility,
        isNull(financialAccounts.deletedAt),
        eq(financialAccounts.archived, true),
        notInArray(financialAccounts.type, [...LIABILITY_ACCOUNT_TYPES])
      ),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
  ]);

  return {
    accounts: accountItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
      archived: false as const,
    })),
    archivedAccounts: archivedAccountItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
      archived: true as const,
    })),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.accounts);
}

export default function FinancialAccounts() {
  const t = useT();
  const { accounts, archivedAccounts, homeCurrency } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const transactional = accounts.filter((a) => isTransactionalAccountType(a.type));
  const holdings = accounts.filter((a) => isAssetHoldingType(a.type));
  const openAdd = () => setAddOpen(true);

  return (
    <div className="space-y-8">
      <FinancialSectionHeader
        title={t.accounts.holdings}
        description={t.accounts.creditCardsUnderDebts}
        action={
          <Button type="button" onClick={openAdd}>
            <Plus />
            {t.accounts.add}
          </Button>
        }
      />

      {accounts.length === 0 && (
        <EmptyState
          message={t.accounts.empty}
          action={
            <Button type="button" onClick={openAdd}>
              <Plus />
              {t.accounts.add}
            </Button>
          }
        />
      )}

      {transactional.length > 0 && (
        <LedgerGroup title={t.nav.accounts}>
          <AccountCards accounts={transactional} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {holdings.length > 0 && (
        <LedgerGroup title={t.accounts.investmentsAndProperty}>
          <AccountCards accounts={holdings} homeCurrency={homeCurrency} />
        </LedgerGroup>
      )}

      {archivedAccounts.length > 0 && (
        <LedgerGroup
          title={t.accounts.archived}
          aside={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? t.accounts.hide : t.accounts.show(archivedAccounts.length)}
            </Button>
          }
        >
          {showArchived ? (
            <AccountCards accounts={archivedAccounts} homeCurrency={homeCurrency} />
          ) : null}
        </LedgerGroup>
      )}

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCurrency={homeCurrency}
      />
    </div>
  );
}
