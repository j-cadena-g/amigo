import { useState } from "react";
import { Pencil } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { formatSignedCents } from "@/app/lib/currency";
import { accountTypeLabel } from "@/app/lib/financial-account-types";
import { cn } from "@/app/lib/utils";
import { EditAccountDialog } from "@/app/components/edit-account-dialog";
import { LedgerSubgroup, RowIconButton } from "@/app/components/financial/ledger-group";

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: CurrencyCode;
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
  const meta = [
    accountTypeLabel(account.type),
    account.isShared ? "Shared" : "Personal",
    account.archived ? "Archived" : null,
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
          {formatSignedCents(account.balance, account.currency)}
        </span>
      </div>
      <RowIconButton
        className="-mr-2"
        onClick={onEdit}
        aria-label={`Edit account ${account.name}`}
      >
        <Pencil />
      </RowIconButton>
    </li>
  );
}

export function AccountCards({ accounts, homeCurrency }: AccountCardsProps) {
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
        <LedgerSubgroup title="Shared">{renderRows(shared)}</LedgerSubgroup>
      )}
      {personal.length > 0 && (
        <LedgerSubgroup title="Personal">{renderRows(personal)}</LedgerSubgroup>
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
