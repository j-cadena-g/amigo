import type { ToastFn } from "@/app/components/toast-provider";

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
    toast(`${label} failed — check your connection`, { variant: "error" });
    return;
  }

  if (res.status === 429) {
    toast("You're doing that a bit fast — give it a second", {
      variant: "error",
    });
    return;
  }

  const message = await readApiErrorMessage(res);
  toast(message ?? `${label} failed`, { variant: "error" });
}
