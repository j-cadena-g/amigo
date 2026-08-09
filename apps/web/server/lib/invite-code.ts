const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_BODY_LENGTH = 6;

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function hashInviteCode(normalized: string): Promise<string> {
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function generateInviteCode(): Promise<{
  code: string;
  codeDisplay: string;
  codeHash: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_BODY_LENGTH));
  let body = "";
  for (const byte of bytes) {
    body += CODE_CHARSET[byte % CODE_CHARSET.length]!;
  }

  const codeDisplay = `AMIGO-${body}`;
  const code = codeDisplay;
  const codeHash = await hashInviteCode(normalizeInviteCode(code));
  return { code, codeDisplay, codeHash };
}
