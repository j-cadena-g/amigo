import type { ToastFn } from "@/app/components/toast-provider";
import type { Messages } from "@/app/i18n";

type CommonMessages = Messages["common"];

/**
 * Fallback when the server rejected a request without a message. `action` is
 * a translated verb phrase such as "save the tag" / "guardar la etiqueta".
 */
export function requestFailedMessage(common: CommonMessages, action: string): string {
  return common.couldNot(action);
}

/** The request never reached the server. */
export function connectionFailedMessage(common: CommonMessages, action: string): string {
  return common.couldNotConnection(action);
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
  action: string,
  common: CommonMessages
): Promise<void> {
  if (res === null) {
    toast(connectionFailedMessage(common, action), { variant: "error" });
    return;
  }

  if (res.status === 429) {
    toast(common.rateLimited, { variant: "error" });
    return;
  }

  const message = await readApiErrorMessage(res);
  toast(message ?? requestFailedMessage(common, action), { variant: "error" });
}
