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
      title: "Leave this household?",
      description:
        "You'll lose access right away. Sign back in within 14 days to restore your access.",
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

  if (isOwner) {
    return (
      <p className="text-muted-foreground">
        You own this household, so you can&apos;t leave it yet. First choose Manage
        next to another member, then Transfer ownership.
      </p>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground">
        You&apos;ll lose access to the household&apos;s lists and money right away.
        You can restore your access within 14 days.
      </p>
      <Button
        variant="destructive"
        className="mt-4"
        disabled={leaving}
        onClick={handleLeave}
      >
        {leaving ? "Leaving…" : "Leave household"}
      </Button>
    </div>
  );
}
