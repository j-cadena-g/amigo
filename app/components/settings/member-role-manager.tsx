import { useState } from "react";
import { useRevalidator } from "react-router";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

interface Member {
  id: string;
  displayName: string;
  role: "owner" | "admin" | "member";
}

interface DataSummary {
  transactions: number;
  recurringRules: number;
  budgets: number;
  assets: number;
  debts: number;
}

interface MemberRoleManagerProps {
  member: Member;
  currentUserRole: "owner" | "admin" | "member";
  currentUserId: string;
}

export function MemberRoleManager({
  member,
  currentUserRole,
  currentUserId,
}: MemberRoleManagerProps) {
  const revalidator = useRevalidator();
  const [submitting, setSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const isSelf = member.id === currentUserId;
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin" || isOwner;

  // Cannot manage yourself or someone with equal/higher role (unless owner)
  const canManage = !isSelf && (isOwner || (isAdmin && member.role === "member"));

  if (!canManage) return null;

  async function handleRoleChange(newRole: "admin" | "member") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${member.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        revalidator.revalidate();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransferOwnership() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${member.id}/transfer-ownership`, {
        method: "POST",
      });
      if (res.ok) {
        setTransferOpen(false);
        revalidator.revalidate();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function openRemoveDialog() {
    setLoadingSummary(true);
    setRemoveOpen(true);
    try {
      const res = await fetch(`/api/members/${member.id}/summary`);
      if (res.ok) {
        const data = (await res.json()) as DataSummary;
        setDataSummary(data);
      }
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleRemove() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRemoveOpen(false);
        revalidator.revalidate();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={submitting}>
            Manage
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {member.role === "member" && (
            <DropdownMenuItem onClick={() => handleRoleChange("admin")}>
              Make Admin
            </DropdownMenuItem>
          )}
          {member.role === "admin" && isOwner && (
            <DropdownMenuItem onClick={() => handleRoleChange("member")}>
              Demote to Member
            </DropdownMenuItem>
          )}
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                Transfer Ownership
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openRemoveDialog}
            className="text-red-600 focus:text-red-600"
          >
            Remove Member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Transfer ownership confirmation */}
      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Ownership</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to transfer household ownership to{" "}
              <strong>{member.displayName}</strong>? You will be demoted to
              admin. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferOwnership}
              disabled={submitting}
            >
              {submitting ? "Transferring..." : "Transfer Ownership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove member confirmation with data summary */}
      <AlertDialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveOpen(false);
            setDataSummary(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{member.displayName}</strong> from the household?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {loadingSummary ? (
            <p className="text-sm text-muted-foreground">
              Loading data summary...
            </p>
          ) : dataSummary ? (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">
                This member&apos;s data in this household:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>{dataSummary.transactions} transaction(s)</li>
                <li>{dataSummary.recurringRules} recurring rule(s)</li>
                <li>{dataSummary.budgets} budget(s)</li>
                <li>{dataSummary.assets} asset(s)</li>
                <li>{dataSummary.debts} debt(s)</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Their data will be preserved but reassigned to the household.
              </p>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={submitting || loadingSummary}
            >
              {submitting ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
