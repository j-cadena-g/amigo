export function buildInviteEmailContent(input: {
  householdName: string;
  inviterName: string;
  code: string;
  joinUrl: string;
  expiresAt: Date;
}): { subject: string; text: string; html: string } {
  const expiresIso = input.expiresAt.toISOString();
  const subject = `Join ${input.householdName} on Amigo`;

  const text = [
    `${input.inviterName} invited you to join ${input.householdName} on Amigo.`,
    "",
    `Join here: ${input.joinUrl}`,
    `Invite code: ${input.code}`,
    `Expires: ${expiresIso}`,
  ].join("\n");

  const html = [
    `<p>${escapeHtml(input.inviterName)} invited you to join <strong>${escapeHtml(input.householdName)}</strong> on Amigo.</p>`,
    `<p><a href="${escapeHtml(input.joinUrl)}">Accept invitation</a></p>`,
    `<p>Invite code: <code>${escapeHtml(input.code)}</code></p>`,
    `<p>Expires: ${escapeHtml(expiresIso)}</p>`,
  ].join("\n");

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
