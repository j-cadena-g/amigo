import { useState } from "react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";

interface LeaveHouseholdProps {
  role: "owner" | "admin" | "member";
}

export function LeaveHousehold({ role }: LeaveHouseholdProps) {
  const confirm = useConfirm();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const isOwner = role === "owner";

  async function handleLeave() {
    const confirmed = await confirm({
      title: "Leave household",
      description:
        "Are you sure you want to leave this household? You can restore access within 14 days if an invite or restore window remains available.",
      confirmText: "Leave household",
      variant: "destructive",
    });
    if (!confirmed) return;

    setLeaving(true);
    try {
      const res = await fetch("/api/members/leave", { method: "POST" });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Leave household");
        return;
      }
      window.location.assign("/restore-account");
    } catch {
      await toastMutationFailure(toast, null, "Leave household");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">Leave household</p>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Transfer ownership to another member before you can leave."
            : "Leave this household. You may restore within the grace window."}
        </p>
      </div>
      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          Use Manage → Transfer Ownership on another member first.
        </p>
      ) : (
        <Button
          variant="destructive"
          disabled={leaving}
          onClick={handleLeave}
        >
          {leaving ? "Leaving..." : "Leave household"}
        </Button>
      )}
    </div>
  );
}
