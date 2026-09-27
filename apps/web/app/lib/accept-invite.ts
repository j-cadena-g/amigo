/**
 * `error` is the server's message when it sent one; `network` means the
 * request never arrived. The page words the fallback in the viewer's language.
 */
export type AcceptInviteResult =
  | { ok: true }
  | { ok: false; error: string | null; network: boolean };

const acceptInFlight = new Map<string, Promise<AcceptInviteResult>>();

/**
 * POST /api/invites/accept with dedupe for the same code while a request is
 * in flight (join deep-link retries Strict Mode double-mount).
 */
export async function acceptInvite(
  code: string,
  getToken: () => Promise<string | null>
): Promise<AcceptInviteResult> {
  const existing = acceptInFlight.get(code);
  if (existing) {
    return existing;
  }

  const request = (async (): Promise<AcceptInviteResult> => {
    try {
      const token = await getToken();
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        return { ok: true };
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { ok: false, error: data?.error ?? null, network: false };
    } catch {
      return { ok: false, error: null, network: true };
    }
  })();

  acceptInFlight.set(code, request);
  try {
    return await request;
  } finally {
    acceptInFlight.delete(code);
  }
}
