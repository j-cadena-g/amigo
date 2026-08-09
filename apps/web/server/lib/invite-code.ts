const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 13 chars × log2(32) ≈ 65 bits — enough entropy without an unreadable token. */
const CODE_BODY_LENGTH = 13;

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

/**
 * Rejection sampling so charset indexing is unbiased even if CODE_CHARSET.length
 * is not a divisor of 256.
 */
function randomCharsetChar(): string {
  const charsetLength = CODE_CHARSET.length;
  const maxUnbiased = Math.floor(256 / charsetLength) * charsetLength;
  let byte = 0;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0]!;
  } while (byte >= maxUnbiased);
  return CODE_CHARSET[byte % charsetLength]!;
}

export async function generateInviteCode(): Promise<{
  code: string;
  codeDisplay: string;
  codeHash: string;
}> {
  let body = "";
  for (let i = 0; i < CODE_BODY_LENGTH; i++) {
    body += randomCharsetChar();
  }

  const codeDisplay = `AMIGO-${body}`;
  const code = codeDisplay;
  const codeHash = await hashInviteCode(normalizeInviteCode(code));
  return { code, codeDisplay, codeHash };
}
