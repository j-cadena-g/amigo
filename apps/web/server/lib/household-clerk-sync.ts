/**
 * Serialize Clerk household-name fan-out per household within an isolate so
 * concurrent renames cannot interleave stale writes.
 */
const householdClerkSyncChains = new Map<string, Promise<unknown>>();

export function enqueueHouseholdClerkNameSync(
  householdId: string,
  task: () => Promise<void>
): Promise<void> {
  const previous = householdClerkSyncChains.get(householdId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  householdClerkSyncChains.set(householdId, next);
  return next.finally(() => {
    if (householdClerkSyncChains.get(householdId) === next) {
      householdClerkSyncChains.delete(householdId);
    }
  });
}

export function householdTimestampMs(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  return Number(value);
}
