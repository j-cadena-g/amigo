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
      await toastMutationFailure(toast, res, "Update role");
    } catch {
      await toastMutationFailure(toast, null, "Update role");
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
      await toastMutationFailure(toast, res, "Transfer ownership");
    } catch {
      await toastMutationFailure(toast, null, "Transfer ownership");
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
      await toastMutationFailure(toast, res, "Load member summary");
    } catch {
      await toastMutationFailure(toast, null, "Load member summary");
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
      await toastMutationFailure(toast, res, "Remove member");
    } catch {
      await toastMutationFailure(toast, null, "Remove member");
    } finally {
      setSubmitting(false);
    }
  }

  const dataDescription = dataSummary ? describeMemberData(dataSummary) : "";

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
              Make admin
            </DropdownMenuItem>
          )}
          {member.role === "admin" && isOwner && (
            <DropdownMenuItem onClick={() => handleRoleChange("member")}>
              Make member
            </DropdownMenuItem>
          )}
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                Transfer ownership
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openRemoveDialog}
            className="text-destructive focus:text-destructive"
          >
            Remove member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Transfer ownership to {member.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll become an admin, and only {member.displayName} will be able
              to transfer ownership back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferOwnership}
              disabled={submitting}
            >
              {submitting ? "Transferring…" : "Transfer ownership"}
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
            <AlertDialogTitle>Remove {member.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll lose access to the household right away.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {loadingSummary ? (
            <p className="text-sm text-muted-foreground">
              Loading what they&apos;ve added…
            </p>
          ) : dataSummary ? (
            <p className="text-sm">
              {dataDescription
                ? `What they added stays in the household: ${dataDescription}.`
                : "They haven't added anything yet."}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={submitting || loadingSummary}
              className={buttonVariants({ variant: "destructive" })}
            >
              {submitting ? "Removing…" : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
