import { useCallback, useEffect, useState } from "react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

interface PendingInvite {
  id: string;
  codeDisplay: string;
  invitedEmail: string | null;
  emailSentAt: string | null;
  emailLastError: string | null;
  expiresAt: string;
  createdAt: string;
}

interface CreatedInvite {
  id: string;
  code: string;
  joinUrl: string;
  expiresAt: string;
  invitedEmail: string | null;
  emailSent: boolean;
  emailError?: string;
}

function buildJoinUrl(codeDisplay: string): string {
  if (typeof window === "undefined") {
    return `/join/${encodeURIComponent(codeDisplay)}`;
  }
  return `${window.location.origin}/join/${encodeURIComponent(codeDisplay)}`;
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InviteManager() {
  const toast = useToast();
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Load invites");
        return;
      }
      const data = (await res.json()) as PendingInvite[];
      setInvites(data);
    } catch {
      await toastMutationFailure(toast, null, "Load invites");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`, { variant: "success" });
    } catch {
      toast(`Couldn't copy ${label.toLowerCase()}`, { variant: "error" });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreated(null);
    try {
      const trimmed = email.trim();
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trimmed ? { email: trimmed } : {}),
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Create invite");
        return;
      }
      const data = (await res.json()) as CreatedInvite;
      setCreated(data);
      setEmail("");
      if (data.invitedEmail) {
        if (data.emailSent) {
          toast("Invite created and email sent", { variant: "success" });
        } else {
          toast(
            data.emailError
              ? `Invite created, but email failed: ${data.emailError}`
              : "Invite created, but email failed to send",
            { variant: "error" }
          );
        }
      } else {
        toast("Invite created", { variant: "success" });
      }
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, "Create invite");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(invite: PendingInvite) {
    const confirmed = await confirm({
      title: "Revoke invite",
      description: `Revoke invite ${invite.codeDisplay}? It will no longer work.`,
      confirmText: "Revoke",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyId(invite.id);
    try {
      const res = await fetch(`/api/invites/${invite.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Revoke invite");
        return;
      }
      if (created?.id === invite.id) {
        setCreated(null);
      }
      toast("Invite revoked", { variant: "success" });
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, "Revoke invite");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResend(invite: PendingInvite) {
    setBusyId(invite.id);
    try {
      const res = await fetch(`/api/invites/${invite.id}/resend`, {
        method: "POST",
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Resend invite");
        return;
      }
      const data = (await res.json()) as {
        emailSent?: boolean;
        emailError?: string;
      };
      if (data.emailSent) {
        toast("Invite email resent", { variant: "success" });
      } else {
        toast(
          data.emailError
            ? `Email failed: ${data.emailError}`
            : "Failed to resend invite email",
          { variant: "error" }
        );
      }
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, "Resend invite");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium mb-1">
            Email <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            autoComplete="email"
          />
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create invite"}
        </Button>
      </form>

      {created && (
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">New invite</p>
            <p className="mt-1 font-mono text-lg tracking-wide">{created.code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyText("Invite link", created.joinUrl)}
            >
              Copy link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText("Invite code", created.code)}
            >
              Copy code
            </Button>
          </div>
          {created.invitedEmail && (
            <p className="text-sm text-muted-foreground">
              {created.emailSent
                ? `Email sent to ${created.invitedEmail}`
                : `Email to ${created.invitedEmail} failed${
                    created.emailError ? `: ${created.emailError}` : ""
                  }`}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">Pending invites</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-sm">{invite.codeDisplay}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {formatExpiry(invite.expiresAt)}
                    {invite.invitedEmail ? ` · ${invite.invitedEmail}` : ""}
                  </p>
                  {invite.invitedEmail && (
                    <p className="text-xs text-muted-foreground">
                      {invite.emailSentAt
                        ? "Email sent"
                        : invite.emailLastError
                          ? `Email error: ${invite.emailLastError}`
                          : "Email not sent"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === invite.id}
                    onClick={() =>
                      void copyText("Invite link", buildJoinUrl(invite.codeDisplay))
                    }
                  >
                    Copy link
                  </Button>
                  {invite.invitedEmail && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === invite.id}
                      onClick={() => void handleResend(invite)}
                    >
                      Resend
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-600"
                    disabled={busyId === invite.id}
                    onClick={() => void handleRevoke(invite)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
