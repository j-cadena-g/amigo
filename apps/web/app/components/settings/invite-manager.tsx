import { useCallback, useEffect, useState } from "react";
import { toastMutationFailure } from "@/app/lib/api-error";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";

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

function formatExpiry(expiresAt: string, locale: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InviteManager() {
  const t = useT();
  const locale = useLocale();
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
        await toastMutationFailure(toast, res, t.household.invites.loadAction, t.common);
        return;
      }
      const data = (await res.json()) as PendingInvite[];
      setInvites(data);
    } catch {
      await toastMutationFailure(toast, null, t.household.invites.loadAction, t.common);
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function copyText(value: string, copied: string, failed: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(copied, { variant: "success" });
    } catch {
      toast(failed, { variant: "error" });
    }
  }

  const copyLink = (url: string) =>
    copyText(url, t.household.invites.linkCopied, t.household.invites.copyLinkFailed);
  const copyCode = (code: string) =>
    copyText(code, t.household.invites.codeCopied, t.household.invites.copyCodeFailed);

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
        await toastMutationFailure(toast, res, t.household.invites.createAction, t.common);
        return;
      }
      const data = (await res.json()) as CreatedInvite;
      setCreated(data);
      setEmail("");
      if (data.invitedEmail) {
        if (data.emailSent) {
          toast(t.household.invites.createdAndSent, { variant: "success" });
        } else {
          toast(t.household.invites.createdNotSent, { variant: "error" });
        }
      } else {
        toast(t.household.invites.created, { variant: "success" });
      }
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, t.household.invites.createAction, t.common);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(invite: PendingInvite) {
    const confirmed = await confirm({
      title: t.household.invites.revokeTitle,
      description: t.household.invites.revokeBody(invite.codeDisplay),
      confirmText: t.household.invites.revokeConfirm,
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyId(invite.id);
    try {
      const res = await fetch(`/api/invites/${invite.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.household.invites.revokeAction, t.common);
        return;
      }
      if (created?.id === invite.id) {
        setCreated(null);
      }
      toast(t.household.invites.revoked, { variant: "success" });
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, t.household.invites.revokeAction, t.common);
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
        await toastMutationFailure(toast, res, t.household.invites.resendAction, t.common);
        return;
      }
      const data = (await res.json()) as {
        emailSent?: boolean;
        emailError?: string;
      };
      if (data.emailSent) {
        toast(t.household.invites.resent, { variant: "success" });
      } else {
        toast(t.household.invites.resendFailed, { variant: "error" });
      }
      await loadInvites();
    } catch {
      await toastMutationFailure(toast, null, t.household.invites.resendAction, t.common);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate}>
        <label htmlFor="invite-email" className="block text-sm font-semibold">
          {t.household.invites.email}{" "}
          <span className="font-normal text-muted-foreground">{t.household.invites.optional}</span>
        </label>
        <p id="invite-email-hint" className="text-sm text-muted-foreground">
          {t.household.invites.emailHint}
        </p>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.household.invites.emailPlaceholder}
            autoComplete="email"
            aria-describedby="invite-email-hint"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={creating} className="shrink-0">
            {creating ? t.household.invites.creating : t.household.invites.create}
          </Button>
        </div>
      </form>

      {created && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">{t.household.invites.newCode}</p>
          <p className="mt-1 break-all font-mono text-lg font-medium">
            {created.code}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.household.invites.expires(formatExpiry(created.expiresAt, locale))}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyLink(created.joinUrl)}
            >
              {t.household.invites.copyLink}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyCode(created.code)}
            >
              {t.household.invites.copyCode}
            </Button>
          </div>
          {created.invitedEmail && (
            <p className="mt-3 text-sm text-muted-foreground">
              {created.emailSent
                ? t.household.invites.emailSentTo(created.invitedEmail)
                : t.household.invites.emailNotSentTo(created.invitedEmail)}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="font-semibold">{t.household.invites.pending}</h3>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.common.loading}</p>
        ) : invites.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.household.invites.none}</p>
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
                    {t.household.invites.expires(formatExpiry(invite.expiresAt, locale))}
                    {invite.invitedEmail ? ` · ${invite.invitedEmail}` : ""}
                  </p>
                  {invite.invitedEmail && (
                    <p className="text-sm text-muted-foreground">
                      {invite.emailSentAt
                        ? t.household.invites.emailSent
                        : invite.emailLastError
                          ? t.household.invites.emailFailed
                          : t.household.invites.emailNotSent}
                    </p>
                  )}
                </div>
                <div className="-ml-3 flex shrink-0 flex-wrap gap-1 sm:ml-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === invite.id}
                    onClick={() => void copyLink(invite.joinUrl)}
                  >
                    {t.household.invites.copyLink}
                  </Button>
                  {invite.invitedEmail && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === invite.id}
                      onClick={() => void handleResend(invite)}
                    >
                      {t.household.invites.resend}
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
                    {t.household.invites.revoke}
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
