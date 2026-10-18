/** How long a deleted grocery item can be brought back before the delete is sent. */
export const UNDO_DELETE_MS = 7000;

export interface PendingDeletes {
  /** Hide the item now and send its delete after `delayMs`, unless undone first. */
  schedule(id: string): void;
  /** Cancel a scheduled delete. False when it already went out (or never existed). */
  undo(id: string): boolean;
  /** Send every scheduled delete now: the page is going away. */
  flush(): void;
}

interface Options {
  delayMs?: number;
  /** Send the real delete. */
  commit: (id: string) => void;
  /** The set of hidden ids changed. */
  onChange: (ids: ReadonlySet<string>) => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Deletes wait out the undo window on the client, so undo needs nothing from
 * the server: the item never left it. Other members see the delete once it's
 * sent, and never see one that was undone.
 */
export function createPendingDeletes({
  delayMs = UNDO_DELETE_MS,
  commit,
  onChange,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: Options): PendingDeletes {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const notify = () => onChange(new Set(timers.keys()));

  function send(id: string) {
    timers.delete(id);
    commit(id);
  }

  return {
    schedule(id) {
      if (timers.has(id)) return;
      timers.set(
        id,
        setTimer(() => {
          send(id);
          notify();
        }, delayMs)
      );
      notify();
    },
    undo(id) {
      const timer = timers.get(id);
      if (timer === undefined) return false;
      clearTimer(timer);
      timers.delete(id);
      notify();
      return true;
    },
    flush() {
      if (timers.size === 0) return;
      for (const [id, timer] of [...timers]) {
        clearTimer(timer);
        send(id);
      }
      notify();
    },
  };
}
