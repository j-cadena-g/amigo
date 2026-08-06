/** Keep client replay and server idempotency rows aligned (90 days). */
export const GROCERY_SYNC_MUTATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
