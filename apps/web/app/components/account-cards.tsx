import { useState } from "react";
import { Pencil } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { formatSignedCents } from "@/app/lib/currency";
import { accountTypeLabel } from "@/app/lib/financial-account-types";
import { cn } from "@/app/lib/utils";
import { EditAccountDialog } from "@/app/components/edit-account-dialog";
import { LedgerSubgroup, RowIconButton } from "@/app/components/financial/ledger-group";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  /** What the account is worth to the household, in cents: negative when money is owed. */
  balance: number;
  /** Credit limit in cents (CREDIT accounts); null when unknown. */
  creditLimit?: number | null;
  /** Amount originally borrowed in cents (LOAN accounts); null when unknown. */
  originalAmount?: number | null;
  currency: CurrencyCode;
  exchangeRateToHome?: number | null;
  userId: string | null;
  isShared?: boolean;
  archived?: boolean;
};

interface AccountCardsProps {
  accounts: AccountRow[];
  homeCurrency: CurrencyCode;
}

function AccountListRow({
  account,
  homeCurrency,
  onEdit,
}: {
  account: AccountRow;
  homeCurrency: CurrencyCode;
  onEdit: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const meta = [
    accountTypeLabel(account.type, t),
    account.isShared ? t.accounts.sharedTag : t.accounts.personalTag,
    account.archived ? t.accounts.archived : null,
    account.currency !== homeCurrency ? account.currency : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-2 py-2.5">
      <div
        className={cn(
          "flex min-w-0 flex-1 items-baseline gap-3",
          account.archived && "text-muted-foreground"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="truncate text-sm text-muted-foreground">{meta}</p>
        </div>
        <span className="shrink-0 font-mono font-medium">
          {formatSignedCents(account.balance, account.currency, locale)}
        </span>
      </div>
      <RowIconButton
        className="-mr-2"
        onClick={onEdit}
        aria-label={t.accounts.editNamed(account.name)}
      >
        <Pencil />
      </RowIconButton>
    </li>
  );
}

export function AccountCards({ accounts, homeCurrency }: AccountCardsProps) {
  const t = useT();
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const shared = accounts.filter((a) => a.isShared === true);
  const personal = accounts.filter((a) => a.isShared !== true);

  const renderRows = (items: AccountRow[]) =>
    items.map((a) => (
      <AccountListRow
        key={a.id}
        account={a}
        homeCurrency={homeCurrency}
        onEdit={() => setEditing(a)}
      />
    ));

  return (
    <>
      {shared.length > 0 && (
        <LedgerSubgroup title={t.accounts.shared}>{renderRows(shared)}</LedgerSubgroup>
      )}
      {personal.length > 0 && (
        <LedgerSubgroup title={t.accounts.personal}>{renderRows(personal)}</LedgerSubgroup>
      )}
      {editing && (
        <EditAccountDialog
          key={editing.id}
          account={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </>
  );
}
