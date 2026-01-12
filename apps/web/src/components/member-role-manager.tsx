"use client";

import { useState, useTransition } from "react";
import {
  MoreVertical,
  Shield,
  User,
  Crown,
  UserMinus,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import {
  updateMemberRole,
  transferOwnership,
  removeMember,
  getMemberDataSummary,
  type MemberDataSummary,
} from "@/actions/members";
import type { UserRole } from "@amigo/db";

interface MemberRoleManagerProps {
  member: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
  };
  currentUserRole: UserRole;
  canTransfer: boolean;
}

export function MemberRoleManager({
  member,
  currentUserRole,
  canTransfer,
}: MemberRoleManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [dataSummary, setDataSummary] = useState<MemberDataSummary | null>(
    null
  );
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const handleRoleChange = (newRole: "admin" | "member") => {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole({
        userId: member.id,
        role: newRole,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update role");
      }
      setIsOpen(false);
    });
  };

  const handleTransfer = () => {
    if (
      !confirm(
        `Are you sure you want to transfer ownership to ${member.name ?? member.email}? You will become an admin.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await transferOwnership(member.id);
      if (!result.success) {
        setError(result.error ?? "Failed to transfer ownership");
      }
      setIsOpen(false);
    });
  };

  const handleRemoveClick = async () => {
    setIsOpen(false);
    setIsLoadingSummary(true);
    setShowRemoveDialog(true);

    const result = await getMemberDataSummary(member.id);
    setIsLoadingSummary(false);

    if (result.success && result.summary) {
      setDataSummary(result.summary);
    } else {
      setError(result.error ?? "Failed to load data summary");
      setShowRemoveDialog(false);
    }
  };

  const handleConfirmRemove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(member.id);
      if (!result.success) {
        setError(result.error ?? "Failed to remove member");
      }
      setShowRemoveDialog(false);
      setDataSummary(null);
    });
  };

  const handleCancelRemove = () => {
    setShowRemoveDialog(false);
    setDataSummary(null);
  };

  // Cannot manage owner unless transferring ownership
  if (member.role === "owner") {
    return null;
  }

  const memberDisplayName = member.name ?? member.email;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md hover:bg-accent"
          disabled={isPending}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border bg-popover shadow-lg">
              <div className="p-1">
                {/* Role change options */}
                {member.role !== "admin" && currentUserRole === "owner" && (
                  <button
                    onClick={() => handleRoleChange("admin")}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    disabled={isPending}
                  >
                    <Shield className="h-4 w-4 text-blue-500" />
                    Make Admin
                  </button>
                )}

                {member.role === "admin" && (
                  <button
                    onClick={() => handleRoleChange("member")}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    disabled={isPending}
                  >
                    <User className="h-4 w-4" />
                    Demote to Member
                  </button>
                )}

                {/* Transfer ownership */}
                {canTransfer && (
                  <button
                    onClick={handleTransfer}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-yellow-600"
                    disabled={isPending}
                  >
                    <Crown className="h-4 w-4" />
                    Transfer Ownership
                  </button>
                )}

                <hr className="my-1" />

                {/* Remove member */}
                <button
                  onClick={handleRemoveClick}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  disabled={isPending}
                >
                  <UserMinus className="h-4 w-4" />
                  Remove from Household
                </button>
              </div>
            </div>
          </>
        )}

        {error && !showRemoveDialog && (
          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Remove Member Confirmation Dialog */}
      {showRemoveDialog && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={handleCancelRemove}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-semibold">Remove Member</h3>
              </div>
              <button
                onClick={handleCancelRemove}
                className="rounded-sm p-1 hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : dataSummary ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to remove{" "}
                  <span className="font-medium text-foreground">
                    {memberDisplayName}
                  </span>{" "}
                  from the household?
                </p>

                <div className="rounded-md border bg-muted/50 p-4 mb-4">
                  <p className="text-sm font-medium mb-2">
                    Their data will be preserved:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {dataSummary.transactions > 0 && (
                      <li>
                        {dataSummary.transactions} transaction
                        {dataSummary.transactions !== 1 ? "s" : ""}
                      </li>
                    )}
                    {dataSummary.recurringTransactions > 0 && (
                      <li>
                        {dataSummary.recurringTransactions} recurring rule
                        {dataSummary.recurringTransactions !== 1 ? "s" : ""}
                      </li>
                    )}
                    {dataSummary.personalBudgets > 0 && (
                      <li>
                        {dataSummary.personalBudgets} personal budget
                        {dataSummary.personalBudgets !== 1 ? "s" : ""}
                      </li>
                    )}
                    {dataSummary.assets > 0 && (
                      <li>
                        {dataSummary.assets} asset
                        {dataSummary.assets !== 1 ? "s" : ""}
                      </li>
                    )}
                    {dataSummary.debts > 0 && (
                      <li>
                        {dataSummary.debts} debt
                        {dataSummary.debts !== 1 ? "s" : ""}
                      </li>
                    )}
                    {dataSummary.groceryItems > 0 && (
                      <li>
                        {dataSummary.groceryItems} grocery item
                        {dataSummary.groceryItems !== 1 ? "s" : ""}
                      </li>
                    )}
                    {Object.values(dataSummary).every((v) => v === 0) && (
                      <li className="italic">No data associated</li>
                    )}
                  </ul>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  The user will no longer be able to access this household. If
                  they log in again, they will rejoin as a new member.
                </p>

                {error && (
                  <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive mb-4">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelRemove}
                    className="rounded-md px-4 py-2 text-sm font-medium hover:bg-accent"
                    disabled={isPending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRemove}
                    className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Remove Member"
                    )}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
