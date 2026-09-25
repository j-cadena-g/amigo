import type { ToastFn } from "@/app/components/toast-provider";

export const RATE_LIMIT_MESSAGE =
  "Too many changes at once. Wait a moment and try again.";

/** Fallback when the server rejected a request without a message. */
export function requestFailedMessage(label: string): string {
  return `${label} failed. Try again.`;
}

/** The request never reached the server. */
export function connectionFailedMessage(label: string): string {
  return `${label} failed. Check your connection and try again.`;
}

export async function readApiErrorMessage(
  res: Response
): Promise<string | null> {
  try {
    const data = (await res.json()) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
  } catch {
    // Non-JSON response body.
  }
  return null;
}

export async function toastMutationFailure(
  toast: ToastFn,
  res: Response | null,
  label: string
): Promise<void> {
  if (res === null) {
    toast(connectionFailedMessage(label), { variant: "error" });
    return;
  }

  if (res.status === 429) {
    toast(RATE_LIMIT_MESSAGE, { variant: "error" });
    return;
  }

  const message = await readApiErrorMessage(res);
  toast(message ?? requestFailedMessage(label), { variant: "error" });
}
