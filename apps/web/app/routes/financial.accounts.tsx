import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  assets,
  financialAccounts,
  households,
  scopeToHousehold,
  eq,
  ne,
  and,
  or,
  isNull,
  parseHomeCurrency,
} from "@amigo/db";
import { Plus } from "lucide-react";
import { AccountCards } from "@/app/components/account-cards";
import { AssetCards } from "@/app/components/asset-cards";
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

  const [accountItems, archivedAccountItems, legacyAssetItems] =
    await Promise.all([
      db.query.financialAccounts.findMany({
        where: and(
          householdScope,
          visibility,
          isNull(financialAccounts.deletedAt),
          eq(financialAccounts.archived, false),
          ne(financialAccounts.type, "CREDIT")
        ),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
      db.query.financialAccounts.findMany({
        where: and(
          householdScope,
          visibility,
          isNull(financialAccounts.deletedAt),
          eq(financialAccounts.archived, true),
          ne(financialAccounts.type, "CREDIT")
        ),
        orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
      }),
      db.query.assets.findMany({
        where: and(
          scopeToHousehold(assets.householdId, session.householdId),
          or(eq(assets.userId, session.userId), isNull(assets.userId)),
          isNull(assets.deletedAt)
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
    legacyAssets: legacyAssetItems.map((a) => ({
      ...a,
      isShared: a.userId === null,
    })),
    homeCurrency: parseHomeCurrency(household?.homeCurrency),
    userId: session.userId,
    role: session.role,
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.accounts);
}

export default function FinancialAccounts() {
  const t = useT();
  const { accounts, archivedAccounts, legacyAssets, homeCurrency, userId, role } =
    useLoaderData<typeof loader>();
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

      {legacyAssets.length > 0 && (
        <LedgerGroup title={t.accounts.legacyAssets}>
          <p className="pt-3 text-sm text-muted-foreground">
            {t.accounts.legacyHint}
          </p>
          <AssetCards
            assets={legacyAssets}
            homeCurrency={homeCurrency}
            session={{ userId, role }}
          />
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
