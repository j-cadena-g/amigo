/**
 * True when the primary pointer is a mouse or trackpad. Same query as Tailwind's
 * `pointer-fine:` variant. False on the server and when it can't be checked, so
 * callers default to touch behavior.
 */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: fine)").matches;
}

/**
 * For a dialog's open auto-focus event. A dialog focuses its first field when it
 * opens; on a touch screen that raises the keyboard before the user has picked a
 * field, so focus the dialog itself instead. Focus still moves into the dialog.
 */
export function focusDialogNotField(
  event: Event,
  finePointer: boolean = hasFinePointer()
): void {
  if (event.defaultPrevented || finePointer) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.focus?.({ preventScroll: true });
}
