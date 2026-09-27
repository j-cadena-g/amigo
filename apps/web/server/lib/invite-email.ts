import type { UiLanguage } from "@amigo/db";

const COPY: Record<
  UiLanguage,
  {
    subject: (household: string) => string;
    invited: (inviter: string, household: string) => string;
    invitedHtml: (inviter: string, household: string) => string;
    joinHere: string;
    accept: string;
    code: string;
    expires: string;
  }
> = {
  en: {
    subject: (household) => `Join ${household} on Amigo`,
    invited: (inviter, household) => `${inviter} invited you to join ${household} on Amigo.`,
    invitedHtml: (inviter, household) =>
      `${inviter} invited you to join <strong>${household}</strong> on Amigo.`,
    joinHere: "Join here",
    accept: "Accept invitation",
    code: "Invite code",
    expires: "Expires",
  },
  es: {
    subject: (household) => `Únete a ${household} en Amigo`,
    invited: (inviter, household) => `${inviter} te invitó a unirte a ${household} en Amigo.`,
    invitedHtml: (inviter, household) =>
      `${inviter} te invitó a unirte a <strong>${household}</strong> en Amigo.`,
    joinHere: "Únete aquí",
    accept: "Aceptar invitación",
    code: "Código de invitación",
    expires: "Vence",
  },
};

/**
 * The invite email in the inviter's language: whoever they're inviting most
 * likely reads it too. `locale` formats the expiry date.
 */
export function buildInviteEmailContent(input: {
  householdName: string;
  inviterName: string;
  code: string;
  joinUrl: string;
  expiresAt: Date;
  language?: UiLanguage;
  locale?: string;
}): { subject: string; text: string; html: string } {
  const copy = COPY[input.language ?? "en"];
  const expires = formatExpiry(input.expiresAt, input.locale ?? "en-CA");

  const text = [
    copy.invited(input.inviterName, input.householdName),
    "",
    `${copy.joinHere}: ${input.joinUrl}`,
    `${copy.code}: ${input.code}`,
    `${copy.expires}: ${expires}`,
  ].join("\n");

  const html = [
    `<p>${copy.invitedHtml(escapeHtml(input.inviterName), escapeHtml(input.householdName))}</p>`,
    `<p><a href="${escapeHtml(input.joinUrl)}">${copy.accept}</a></p>`,
    `<p>${copy.code}: <code>${escapeHtml(input.code)}</code></p>`,
    `<p>${copy.expires}: ${escapeHtml(expires)}</p>`,
  ].join("\n");

  return { subject: copy.subject(input.householdName), text, html };
}

/**
 * "October 4, 2026 at 12:00 PM UTC" / "4 de octubre de 2026, 12:00 p. m. UTC":
 * the exact moment the invite stops working, labeled in UTC since the
 * recipient's own time zone isn't known.
 */
function formatExpiry(date: Date, locale: string): string {
  try {
    const formatted = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
    return `${formatted} UTC`;
  } catch {
    return date.toISOString();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
