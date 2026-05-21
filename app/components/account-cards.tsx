import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { formatCents } from "@/app/lib/currency";
import { Pencil } from "lucide-react";
import { EditAccountDialog } from "@/app/components/edit-account-dialog";
import type { CurrencyCode } from "@amigo/db";
import { accountTypeLabel } from "@/app/lib/financial-account-types";

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: CurrencyCode;
  userId: string | null;
  isShared?: boolean;
};

interface AccountCardsProps {
  accounts: AccountRow[];
}

function AccountCard({
  account,
  onEdit,
}: {
  account: AccountRow;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-base truncate">{account.name}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {accountTypeLabel(account.type)}
            {account.isShared ? " · Shared" : " · Personal"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onEdit}
          aria-label={`Edit account ${account.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold tabular-nums">
          {formatCents(account.balance, account.currency)}
        </p>
      </CardContent>
    </Card>
  );
}

export function AccountCards({ accounts }: AccountCardsProps) {
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const shared = accounts.filter((a) => a.isShared === true);
  const personal = accounts.filter((a) => a.isShared !== true);

  return (
    <>
      <div className="space-y-6">
        {shared.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Shared
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shared.map((a) => (
                <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} />
              ))}
            </div>
          </div>
        )}
        {personal.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Personal
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {personal.map((a) => (
                <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} />
              ))}
            </div>
          </div>
        )}
        {accounts.length === 0 && (
          <p className="text-center text-muted-foreground py-10 text-sm">
            No accounts yet. Add a checking account, investment, or other holding to get
            started.
          </p>
        )}
      </div>
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
