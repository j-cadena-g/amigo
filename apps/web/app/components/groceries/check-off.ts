/** Length of the strike-through on a checked item. Matches `after:duration-150` in grocery-item.tsx. */
export const STRIKE_THROUGH_MS = 150;

/** How long a checked item stays in place before it moves to the bought list. */
export function checkOffDelayMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : STRIKE_THROUGH_MS + 50;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
