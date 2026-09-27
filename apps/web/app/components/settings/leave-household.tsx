import { useState } from "react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/i18n";

interface LeaveHouseholdProps {
  role: "owner" | "admin" | "member";
}

export function LeaveHousehold({ role }: LeaveHouseholdProps) {
  const t = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const isOwner = role === "owner";

  async function handleLeave() {
    const confirmed = await confirm({
      title: t.settings.leave.confirmTitle,
      description: t.settings.leave.confirmBody,
      confirmText: t.settings.leave.button,
      variant: "destructive",
    });
    if (!confirmed) return;

    setLeaving(true);
    try {
      const res = await fetch("/api/members/leave", { method: "POST" });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.settings.leave.action, t.common);
        return;
      }
      window.location.assign("/restore-account");
    } catch {
      await toastMutationFailure(toast, null, t.settings.leave.action, t.common);
    } finally {
      setLeaving(false);
    }
  }

  if (isOwner) {
    return (
      <p className="text-muted-foreground">{t.settings.leave.ownerBlocked}</p>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground">{t.settings.leave.body}</p>
      <Button
        variant="destructive"
        className="mt-4"
        disabled={leaving}
        onClick={handleLeave}
      >
        {leaving ? t.settings.leave.leaving : t.settings.leave.button}
      </Button>
    </div>
  );
}
