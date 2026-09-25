import { useCallback, useEffect, useState } from "react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

interface PendingInvite {
  id: string;
  codeDisplay: string;
  joinUrl: string;
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
      toast(`Couldn't copy the ${label.toLowerCase()}. Try again.`, {
        variant: "error",
      });
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
              ? `Invite created, but the email didn't send: ${data.emailError}`
              : "Invite created, but the email didn't send. Share the code instead.",
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
      title: "Revoke this invite?",
      description: `${invite.codeDisplay} will stop working right away.`,
      confirmText: "Revoke invite",
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
        toast("Invite email sent again", { variant: "success" });
      } else {
        toast(
          data.emailError
            ? `The email didn't send: ${data.emailError}`
            : "The email didn't send. Share the code instead.",
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
    <div className="space-y-8">
      <form onSubmit={handleCreate}>
        <label htmlFor="invite-email" className="block text-sm font-semibold">
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <p id="invite-email-hint" className="text-sm text-muted-foreground">
          Add an email to send the link, or leave it blank and share the code
          yourself.
        </p>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            aria-describedby="invite-email-hint"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={creating} className="shrink-0">
            {creating ? "Creating…" : "Create invite"}
          </Button>
        </div>
      </form>

      {created && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">New invite code</p>
          <p className="mt-1 break-all font-mono text-lg font-medium">
            {created.code}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Expires {formatExpiry(created.expiresAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
            <p className="mt-3 text-sm text-muted-foreground">
              {created.emailSent
                ? `Email sent to ${created.invitedEmail}`
                : `The email to ${created.invitedEmail} didn't send${
                    created.emailError ? `: ${created.emailError}` : ""
                  }`}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="font-semibold">Pending invites</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono font-medium">
                    {invite.codeDisplay}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Expires {formatExpiry(invite.expiresAt)}
                    {invite.invitedEmail ? ` · ${invite.invitedEmail}` : ""}
                  </p>
                  {invite.invitedEmail && (
                    <p className="text-sm text-muted-foreground">
                      {invite.emailSentAt
                        ? "Email sent"
                        : invite.emailLastError
                          ? `Email didn't send: ${invite.emailLastError}`
                          : "Email not sent"}
                    </p>
                  )}
                </div>
                <div className="-ml-3 flex shrink-0 flex-wrap gap-1 sm:ml-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === invite.id}
                    onClick={() => void copyText("Invite link", invite.joinUrl)}
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
                      Resend email
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
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
