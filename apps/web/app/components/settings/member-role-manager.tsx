import { useState } from "react";
import { useRevalidator } from "react-router";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useToast } from "@/app/components/toast-provider";
import { Button, buttonVariants } from "@/app/components/ui/button";
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
import { describeMemberData, type MemberDataSummary } from "./member-data-summary";
import { useLanguage, useT } from "@/app/i18n";

interface Member {
  id: string;
  displayName: string;
  role: "owner" | "admin" | "member";
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
  const t = useT();
  const language = useLanguage();
  const revalidator = useRevalidator();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [dataSummary, setDataSummary] = useState<MemberDataSummary | null>(null);
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
        return;
      }
      await toastMutationFailure(toast, res, t.household.members.roleAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.household.members.roleAction, t.common);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransferOwnership() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/members/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: member.id }),
      });
      if (res.ok) {
        setTransferOpen(false);
        revalidator.revalidate();
        return;
      }
      await toastMutationFailure(toast, res, t.household.members.transferAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.household.members.transferAction, t.common);
    } finally {
      setSubmitting(false);
    }
  }

  async function openRemoveDialog() {
    setLoadingSummary(true);
    setRemoveOpen(true);
    try {
      const res = await fetch(`/api/members/${member.id}/data-summary`);
      if (res.ok) {
        const data = (await res.json()) as MemberDataSummary;
        setDataSummary(data);
        return;
      }
      await toastMutationFailure(toast, res, t.household.members.summaryAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.household.members.summaryAction, t.common);
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
        return;
      }
      await toastMutationFailure(toast, res, t.household.members.removeAction, t.common);
    } catch {
      await toastMutationFailure(toast, null, t.household.members.removeAction, t.common);
    } finally {
      setSubmitting(false);
    }
  }

  const dataDescription = dataSummary ? describeMemberData(dataSummary, language) : "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={submitting}>
            {t.household.members.manage}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {member.role === "member" && (
            <DropdownMenuItem onClick={() => handleRoleChange("admin")}>
              {t.household.members.makeAdmin}
            </DropdownMenuItem>
          )}
          {member.role === "admin" && isOwner && (
            <DropdownMenuItem onClick={() => handleRoleChange("member")}>
              {t.household.members.makeMember}
            </DropdownMenuItem>
          )}
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                {t.household.members.transfer}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openRemoveDialog}
            className="text-destructive focus:text-destructive"
          >
            {t.household.members.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.household.members.transferTitle(member.displayName)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.household.members.transferBody(member.displayName)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferOwnership}
              disabled={submitting}
            >
              {submitting ? t.household.members.transferring : t.household.members.transfer}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogTitle>{t.household.members.removeTitle(member.displayName)}</AlertDialogTitle>
            <AlertDialogDescription>{t.household.members.removeBody}</AlertDialogDescription>
          </AlertDialogHeader>

          {loadingSummary ? (
            <p className="text-sm text-muted-foreground">{t.household.members.loadingData}</p>
          ) : dataSummary ? (
            <p className="text-sm">
              {dataDescription ? t.household.members.dataStays(dataDescription) : t.household.members.nothingAdded}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={submitting || loadingSummary}
              className={buttonVariants({ variant: "destructive" })}
            >
              {submitting ? t.household.members.removing : t.household.members.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
