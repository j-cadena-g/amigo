# Track A — Trust & Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make offline grocery changes survive reload, surface permanently failed syncs, stop one household’s recurring cron failure from blocking others, and stop silent mutation failures in the highest-traffic UI paths.

**Architecture:** Keep groceries as the offline domain. Persist optimistic grocery mutations into Dexie (`groceryItems` + `syncQueue`) and re-apply pending queue entries when reading offline data. Expand `processSyncQueue`’s return value so the groceries flush path can toast discarded mutations. Isolate per-rule errors inside `processDueRecurringRules`. Extract a tiny shared `readApiErrorMessage` / toast helper and wire it into the silent `if (res.ok)` call sites (members, recurring toggle/delete, budget delete, calendar month fetch).

**Tech Stack:** Dexie (IndexedDB), Vitest (unit), React + existing `useToast`, Cloudflare Worker cron via `processDueRecurringRules`.

## Global Constraints

- Do **not** expand offline sync to transactions/budgets/debts in this plan (Track B/C territory).
- Do **not** change Origin/CSRF, Clerk token modes, or APNs.
- Prefer pure helpers under `apps/web/app/lib/offline/` so unit tests run in Node without IndexedDB.
- Reuse existing `useToast` — do not invent a second notification system.
- Keep commits small and focused per task.
- Run tests from repo root with `pnpm --filter @amigo/web run test:unit` unless a step names a narrower file.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/app/lib/offline/local-mutations.ts` | Pure apply/persist-shape helpers for queued grocery ops |
| `apps/web/app/lib/offline/local-mutations.test.ts` | Unit tests for those helpers |
| `apps/web/app/lib/offline/sync-queue.ts` | Call local persist when enqueueing; export discard helpers cleanly |
| `apps/web/app/lib/offline/hydration.ts` | `getOfflineItems` overlays pending queue |
| `apps/web/app/lib/offline/sync-processor.ts` | Return `discarded` separately; stop silent drops |
| `apps/web/app/lib/offline/sync-processor.test.ts` | Unit tests with mocked fetch + in-memory stubs where needed |
| `apps/web/app/components/groceries/use-grocery-logic.ts` | Persist on offline queue; toast discarded syncs |
| `apps/web/app/lib/api-error.ts` | Shared `readApiErrorMessage` (+ optional toast helper) |
| `apps/web/app/lib/api-error.test.ts` | Unit tests for error parsing |
| `apps/web/server/lib/recurring-processor.ts` | Per-rule try/catch isolation |
| `apps/web/server/lib/recurring-processor.test.ts` | Cover isolation behavior with a focused unit test |
| Silent-fail UI files | Toast on failure (see Task 5) |

---

### Task 1: Pure local grocery mutation helpers

**Files:**
- Create: `apps/web/app/lib/offline/local-mutations.ts`
- Create: `apps/web/app/lib/offline/local-mutations.test.ts`
- Modify: `apps/web/app/lib/offline/index.ts` (re-export new helpers)

**Interfaces:**
- Consumes: `SyncQueueEntry` / `QueuedMutation` from `sync-queue.ts` / `db.ts`; `OfflineGroceryItem` from `db.ts`
- Produces:
  - `applyQueuedMutationToItems(items: OfflineGroceryItem[], mutation: Pick<SyncQueueEntry, "operation" | "entityId" | "payload">, ctx: LocalMutationContext): OfflineGroceryItem[]`
  - `buildOfflineItemForAdd(ctx, entityId, payload): OfflineGroceryItem`
  - `type LocalMutationContext = { householdId: string; userId: string; now?: number }`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/lib/offline/local-mutations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyQueuedMutationToItems,
  buildOfflineItemForAdd,
} from "./local-mutations";
import type { OfflineGroceryItem } from "./db";

const ctx = { householdId: "hh1", userId: "u1", now: 1_700_000_000_000 };

function item(partial: Partial<OfflineGroceryItem> & { id: string }): OfflineGroceryItem {
  return {
    householdId: "hh1",
    createdByUserId: "u1",
    createdByUserDisplayName: "Ada",
    itemName: "Milk",
    category: null,
    isPurchased: false,
    purchasedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    tagIds: [],
    _localVersion: 0,
    _serverVersion: 0,
    _syncStatus: "pending",
    ...partial,
  };
}

describe("applyQueuedMutationToItems", () => {
  it("adds a new pending item", () => {
    const next = applyQueuedMutationToItems(
      [],
      {
        operation: "add",
        entityId: "temp-1",
        payload: { name: "Eggs", tagIds: ["t1"] },
      },
      ctx
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: "temp-1",
      itemName: "Eggs",
      tagIds: ["t1"],
      _syncStatus: "pending",
      deletedAt: null,
    });
  });

  it("toggles purchase state", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1", isPurchased: false })],
      { operation: "toggle", entityId: "g1", payload: {} },
      ctx
    );
    expect(next[0]?.isPurchased).toBe(true);
    expect(next[0]?._syncStatus).toBe("pending");
  });

  it("soft-deletes an item", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1" })],
      { operation: "delete", entityId: "g1", payload: {} },
      ctx
    );
    expect(next[0]?.deletedAt).toBe(ctx.now);
    expect(next[0]?._syncStatus).toBe("pending");
  });

  it("updates tag ids", () => {
    const next = applyQueuedMutationToItems(
      [item({ id: "g1", tagIds: ["a"] })],
      { operation: "updateTags", entityId: "g1", payload: { tagIds: ["b", "c"] } },
      ctx
    );
    expect(next[0]?.tagIds).toEqual(["b", "c"]);
  });

  it("is a no-op for unknown entity on non-add ops", () => {
    const base = [item({ id: "g1" })];
    const next = applyQueuedMutationToItems(
      base,
      { operation: "toggle", entityId: "missing", payload: {} },
      ctx
    );
    expect(next).toEqual(base);
  });
});

describe("buildOfflineItemForAdd", () => {
  it("builds a pending offline row", () => {
    const row = buildOfflineItemForAdd(ctx, "temp-1", {
      name: "Bread",
      tagIds: [],
    });
    expect(row.itemName).toBe("Bread");
    expect(row._serverVersion).toBe(0);
    expect(row._syncStatus).toBe("pending");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/local-mutations.test.ts`

Expected: FAIL — module not found / export missing.

- [ ] **Step 3: Implement helpers**

Create `apps/web/app/lib/offline/local-mutations.ts`:

```ts
import type { OfflineGroceryItem } from "./db";

export type LocalMutationContext = {
  householdId: string;
  userId: string;
  now?: number;
};

type QueuedOp = {
  operation: "add" | "toggle" | "delete" | "updateTags";
  entityId: string;
  payload: Record<string, unknown>;
};

function nowMs(ctx: LocalMutationContext): number {
  return ctx.now ?? Date.now();
}

export function buildOfflineItemForAdd(
  ctx: LocalMutationContext,
  entityId: string,
  payload: Record<string, unknown>
): OfflineGroceryItem {
  const t = nowMs(ctx);
  const name = typeof payload.name === "string" ? payload.name : "";
  const tagIds = Array.isArray(payload.tagIds)
    ? payload.tagIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: entityId,
    householdId: ctx.householdId,
    createdByUserId: ctx.userId,
    createdByUserDisplayName: null,
    itemName: name,
    category: null,
    isPurchased: false,
    purchasedAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    tagIds,
    _localVersion: 1,
    _serverVersion: 0,
    _syncStatus: "pending",
  };
}

export function applyQueuedMutationToItems(
  items: OfflineGroceryItem[],
  mutation: QueuedOp,
  ctx: LocalMutationContext
): OfflineGroceryItem[] {
  const t = nowMs(ctx);

  if (mutation.operation === "add") {
    const without = items.filter((i) => i.id !== mutation.entityId);
    return [
      buildOfflineItemForAdd(ctx, mutation.entityId, mutation.payload),
      ...without,
    ];
  }

  return items.map((item) => {
    if (item.id !== mutation.entityId) return item;

    if (mutation.operation === "toggle") {
      const isPurchased = !item.isPurchased;
      return {
        ...item,
        isPurchased,
        purchasedAt: isPurchased ? t : null,
        updatedAt: t,
        _localVersion: item._localVersion + 1,
        _syncStatus: "pending",
      };
    }

    if (mutation.operation === "delete") {
      return {
        ...item,
        deletedAt: t,
        updatedAt: t,
        _localVersion: item._localVersion + 1,
        _syncStatus: "pending",
      };
    }

    // updateTags
    const tagIds = Array.isArray(mutation.payload.tagIds)
      ? mutation.payload.tagIds.filter((id): id is string => typeof id === "string")
      : item.tagIds ?? [];
    return {
      ...item,
      tagIds,
      updatedAt: t,
      _localVersion: item._localVersion + 1,
      _syncStatus: "pending",
    };
  });
}
```

Re-export from `apps/web/app/lib/offline/index.ts`:

```ts
export {
  applyQueuedMutationToItems,
  buildOfflineItemForAdd,
} from "./local-mutations";
export type { LocalMutationContext } from "./local-mutations";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/local-mutations.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib/offline/local-mutations.ts \
  apps/web/app/lib/offline/local-mutations.test.ts \
  apps/web/app/lib/offline/index.ts
git commit -m "$(cat <<'EOF'
feat(offline): add pure helpers for local grocery mutations

EOF
)"
```

---

### Task 2: Persist queued mutations into Dexie and hydrate from the queue

**Files:**
- Modify: `apps/web/app/lib/offline/sync-queue.ts`
- Modify: `apps/web/app/lib/offline/hydration.ts`
- Modify: `apps/web/app/components/groceries/use-grocery-logic.ts` (only if persist needs UI-held display name — prefer keeping persist inside `queueMutation`)
- Create: `apps/web/app/lib/offline/hydration.test.ts` (pure overlay tests; mock DB boundary by testing a new exported pure function)

**Interfaces:**
- Consumes: `applyQueuedMutationToItems`, `getOfflineSessionContext`
- Produces:
  - `queueMutation` also writes `groceryItems` when session context exists
  - `overlayPendingMutations(items, mutations, ctx): OfflineGroceryItem[]` exported for tests
  - `getOfflineItems` returns items after overlay + `deletedAt === null` filter

- [ ] **Step 1: Write failing overlay tests**

Create `apps/web/app/lib/offline/hydration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overlayPendingMutations } from "./hydration";
import type { OfflineGroceryItem } from "./db";
import type { SyncQueueEntry } from "./db";

const ctx = { householdId: "hh1", userId: "u1", now: 1_700_000_000_100 };

function entry(
  partial: Partial<SyncQueueEntry> & Pick<SyncQueueEntry, "operation" | "entityId">
): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: ctx.now,
    entityType: "groceryItem",
    payload: {},
    retryCount: 0,
    lastError: null,
    ...partial,
  };
}

describe("overlayPendingMutations", () => {
  it("replays queued add onto an empty cache", () => {
    const result = overlayPendingMutations(
      [],
      [entry({ operation: "add", entityId: "temp-1", payload: { name: "Rice", tagIds: [] } })],
      ctx
    );
    expect(result.map((i) => i.itemName)).toEqual(["Rice"]);
  });

  it("hides soft-deleted items after overlay", () => {
    const existing: OfflineGroceryItem[] = [
      {
        id: "g1",
        householdId: "hh1",
        createdByUserId: "u1",
        createdByUserDisplayName: null,
        itemName: "Milk",
        category: null,
        isPurchased: false,
        purchasedAt: null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        tagIds: [],
        _localVersion: 0,
        _serverVersion: 10,
        _syncStatus: "synced",
      },
    ];
    const result = overlayPendingMutations(
      existing,
      [entry({ operation: "delete", entityId: "g1" })],
      ctx
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/hydration.test.ts`

Expected: FAIL — `overlayPendingMutations` not exported.

- [ ] **Step 3: Implement overlay + persist wiring**

In `hydration.ts`, add and use:

```ts
import { applyQueuedMutationToItems, type LocalMutationContext } from "./local-mutations";
import type { SyncQueueEntry } from "./db";

export function overlayPendingMutations(
  items: OfflineGroceryItem[],
  mutations: SyncQueueEntry[],
  ctx: LocalMutationContext
): OfflineGroceryItem[] {
  const groceryMutations = mutations
    .filter((m) => m.entityType === "groceryItem")
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  let next = items;
  for (const mutation of groceryMutations) {
    next = applyQueuedMutationToItems(next, mutation, ctx);
  }
  return next.filter((item) => item.deletedAt === null);
}
```

Update `getOfflineItems`:

```ts
export async function getOfflineItems(
  householdId?: string
): Promise<OfflineGroceryItem[]> {
  const db = getOfflineDB();
  const session = await getOfflineSessionContext();

  let items = householdId
    ? await db.groceryItems.where("householdId").equals(householdId).toArray()
    : await db.groceryItems.toArray();

  const pending = await db.syncQueue.orderBy("timestamp").toArray();
  if (pending.length === 0) {
    return items.filter((item) => item.deletedAt === null);
  }

  const ctx: LocalMutationContext = {
    householdId: householdId ?? session?.householdId ?? "",
    userId: session?.userId ?? "",
  };
  return overlayPendingMutations(items, pending, ctx);
}
```

Import `getOfflineSessionContext` from `./sync-queue` (already partially imported via other exports — add named import).

In `sync-queue.ts`, after `db.syncQueue.add(entry)`, persist local item state:

```ts
import { applyQueuedMutationToItems } from "./local-mutations";

// inside queueMutation, after add:
const session = await getOfflineSessionContext();
if (session && mutation.entityType === "groceryItem") {
  const existing = await db.groceryItems.toArray();
  const next = applyQueuedMutationToItems(existing, mutation, {
    householdId: session.householdId,
    userId: session.userId,
  });
  const row = next.find((i) => i.id === mutation.entityId);
  if (row) {
    await db.groceryItems.put(row);
  }
}
```

Note: for `delete`, `applyQueuedMutationToItems` soft-deletes in the array; `put` that soft-deleted row. `getOfflineItems` filters it out after overlay (and the put ensures reload-without-overlay still has the tombstone if overlay is skipped).

- [ ] **Step 4: Run overlay tests**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/hydration.test.ts app/lib/offline/local-mutations.test.ts`

Expected: PASS

- [ ] **Step 5: Manual sanity check (optional but recommended)**

With `pnpm run dev` (if 1Password env available): open Groceries → DevTools → Network Offline → add item → hard reload → item still visible → go online → sync toast appears.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/lib/offline/hydration.ts \
  apps/web/app/lib/offline/hydration.test.ts \
  apps/web/app/lib/offline/sync-queue.ts
git commit -m "$(cat <<'EOF'
fix(offline): persist queued grocery edits across reload

EOF
)"
```

---

### Task 3: Surface permanently failed / discarded sync mutations

**Files:**
- Modify: `apps/web/app/lib/offline/sync-processor.ts`
- Modify: `apps/web/app/lib/offline/sync-queue.ts` (`clearFailedMutations` — keep, but have processor return discarded details)
- Modify: `apps/web/app/components/groceries/use-grocery-logic.ts` (`flush`)
- Create: `apps/web/app/lib/offline/sync-processor.test.ts`

**Interfaces:**
- Consumes: existing queue helpers
- Produces: `processSyncQueue(): Promise<{ processed: number; failed: number; discarded: number }>`
  - `failed` = still queued after this run (retryable)
  - `discarded` = removed because `retryCount >= MAX_RETRIES`

- [ ] **Step 1: Write failing tests for return shape**

Because Dexie needs a browser, keep these tests focused on pure discard accounting by exporting a small helper:

In `sync-processor.ts` (or a tiny `sync-processor-utils.ts` if you prefer separation):

```ts
export function partitionViableMutations<T extends { retryCount: number }>(
  mutations: T[],
  maxRetries = 5
): { viable: T[]; expired: T[] } {
  return {
    viable: mutations.filter((m) => m.retryCount < maxRetries),
    expired: mutations.filter((m) => m.retryCount >= maxRetries),
  };
}
```

Test file:

```ts
import { describe, expect, it } from "vitest";
import { partitionViableMutations } from "./sync-processor";

describe("partitionViableMutations", () => {
  it("separates expired retries", () => {
    const { viable, expired } = partitionViableMutations([
      { retryCount: 0 },
      { retryCount: 5 },
      { retryCount: 4 },
      { retryCount: 6 },
    ]);
    expect(viable.map((m) => m.retryCount)).toEqual([0, 4]);
    expect(expired.map((m) => m.retryCount)).toEqual([5, 6]);
  });
});
```

- [ ] **Step 2: Run test to verify fail/pass cycle**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/sync-processor.test.ts`

Implement `partitionViableMutations`, use it inside `processSyncQueue`, and change the return to:

```ts
export async function processSyncQueue(): Promise<{
  processed: number;
  failed: number;
  discarded: number;
}> {
  const mutations = await getPendingMutations();
  if (mutations.length === 0) {
    return { processed: 0, failed: 0, discarded: 0 };
  }

  const { viable, expired } = partitionViableMutations(mutations, MAX_RETRIES);
  for (const m of expired) {
    await removeMutation(m.id);
  }

  // ... existing batch loop, but:
  // totalFailed should ONLY count mutations still queued (markMutationFailed),
  // NOT expired/discarded.
  let totalProcessed = 0;
  let totalFailed = 0;
  const discarded = expired.length;

  // on network/server batch failure: markMutationFailed + totalFailed += batch.length
  // do not add expired into totalFailed

  return { processed: totalProcessed, failed: totalFailed, discarded };
}
```

Remove dead duplication later: keep `clearFailedMutations` but have it call the same partition helper, or leave it and add a one-line comment that `processSyncQueue` is the live path.

- [ ] **Step 3: Toast discarded + failed in `flush`**

In `use-grocery-logic.ts` flush:

```ts
const result = await processSyncQueue();
if (cancelled) return;

if (result.processed > 0) {
  revalidator.revalidate();
  toast(
    `Synced ${result.processed} offline change${
      result.processed === 1 ? "" : "s"
    }`,
    { variant: "success" }
  );
}

if (result.discarded > 0) {
  toast(
    `${result.discarded} offline change${
      result.discarded === 1 ? "" : "s"
    } could not sync and ${
      result.discarded === 1 ? "was" : "were"
    } discarded — please re-apply ${
      result.discarded === 1 ? "it" : "them"
    }`,
    { variant: "error", duration: 8000 }
  );
  revalidator.revalidate();
}
```

Do **not** toast every transient `failed` retry (noisy). Discarded is the trust-critical signal.

- [ ] **Step 4: Run unit tests**

Run: `pnpm --filter @amigo/web exec vitest run app/lib/offline/`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib/offline/sync-processor.ts \
  apps/web/app/lib/offline/sync-processor.test.ts \
  apps/web/app/components/groceries/use-grocery-logic.ts
git commit -m "$(cat <<'EOF'
fix(offline): toast when sync permanently discards mutations

EOF
)"
```

---

### Task 4: Isolate per-rule failures in recurring cron

**Files:**
- Modify: `apps/web/server/lib/recurring-processor.ts`
- Modify: `apps/web/server/lib/recurring-processor.test.ts`
- Modify: `apps/web/worker.ts` (log `failed` if return shape expands)

**Interfaces:**
- Consumes: existing `processDueRecurringRules(env, db, options)`
- Produces: `{ processed: number; failed: number }` — never throw for a single rule’s non-PK error when `mode: "all_households"`; still safe to throw only on catastrophic DB init failures outside the loop (none today).

- [ ] **Step 1: Write a focused isolation unit test**

The full processor needs D1. Prefer extracting the control-flow decision:

```ts
// recurring-processor.ts
export function shouldAdvanceAfterInsertAttempt(args: {
  inserted: boolean;
  error: unknown | null;
}): "advance" | "skip" | "pk-conflict-advance" {
  if (args.error == null) return "advance";
  if (isSqlitePrimaryKeyConflict(args.error)) return "pk-conflict-advance";
  return "skip";
}
```

Test:

```ts
it("shouldAdvanceAfterInsertAttempt skips non-PK errors", () => {
  expect(
    shouldAdvanceAfterInsertAttempt({
      inserted: false,
      error: new Error("FX API down"),
    })
  ).toBe("skip");
});

it("shouldAdvanceAfterInsertAttempt advances on PK conflict", () => {
  expect(
    shouldAdvanceAfterInsertAttempt({
      inserted: false,
      error: new Error("UNIQUE constraint failed: transactions.id"),
    })
  ).toBe("pk-conflict-advance");
});
```

- [ ] **Step 2: Run test — expect FAIL, then implement decision helper**

- [ ] **Step 3: Rewire the loop**

Replace the throw-on-non-PK path with:

```ts
let processedCount = 0;
let failedCount = 0;
const countsByHousehold = new Map<string, number>();

for (const rule of dueRules) {
  const transactionId = buildRecurringOccurrenceTransactionId(
    rule.id,
    rule.nextRunDate
  );
  let inserted = false;
  let error: unknown | null = null;

  try {
    const homeCurrency = await getHomeCurrency(db, rule.householdId);
    const exchangeRateToHome = await getExchangeRateForRecord(
      env,
      rule.currency,
      homeCurrency
    );

    await db.insert(transactions).values({
      id: transactionId,
      householdId: rule.householdId,
      userId: rule.userId,
      amount: rule.amount,
      currency: rule.currency,
      exchangeRateToHome,
      categoryId: rule.categoryId,
      category: rule.category,
      description: rule.description,
      type: rule.type,
      date: rule.nextRunDate,
      budgetId: rule.budgetId,
    });
    inserted = true;
  } catch (err) {
    error = err;
  }

  const decision = shouldAdvanceAfterInsertAttempt({ inserted, error });
  if (decision === "skip") {
    failedCount++;
    console.error(
      JSON.stringify({
        message: "processDueRecurringRules rule failed",
        ruleId: rule.id,
        householdId: rule.householdId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    continue; // do not advance nextRunDate — retry next cron
  }

  if (inserted) {
    processedCount++;
    countsByHousehold.set(
      rule.householdId,
      (countsByHousehold.get(rule.householdId) ?? 0) + 1
    );
  }

  await advanceRecurringRuleIfCurrent(db, rule);
}

// broadcasts unchanged...
return { processed: processedCount, failed: failedCount };
```

Update `worker.ts` log to include `failed: result.failed`.

- [ ] **Step 4: Run recurring unit tests**

Run: `pnpm --filter @amigo/web exec vitest run server/lib/recurring-processor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/lib/recurring-processor.ts \
  apps/web/server/lib/recurring-processor.test.ts \
  apps/web/worker.ts
git commit -m "$(cat <<'EOF'
fix(cron): isolate recurring rule failures per household

EOF
)"
```

---

### Task 5: Shared API error helper + stop silent mutation failures

**Files:**
- Create: `apps/web/app/lib/api-error.ts`
- Create: `apps/web/app/lib/api-error.test.ts`
- Modify: `apps/web/app/components/groceries/use-grocery-logic.ts` (replace local `readErrorMessage`)
- Modify: `apps/web/app/components/settings/member-role-manager.tsx`
- Modify: `apps/web/app/components/recurring-list.tsx`
- Modify: `apps/web/app/components/budget-list.tsx` (`handleDelete` only)
- Modify: `apps/web/app/components/calendar.tsx` (`fetchEvents`)

**Interfaces:**
- Produces:
  - `readApiErrorMessage(res: Response): Promise<string | null>`
  - `toastMutationFailure(toast: ToastFn, res: Response | null, label: string): Promise<void>`
    - `res === null` → network toast
    - `429` → rate-limit copy (same as groceries)
    - else → server `error` string or `${label} failed`

**Out of scope for this task:** dialogs that already set inline `error` / `formError` (transaction add, budget add/edit, account/debt dialogs). Do not double-notify.

- [ ] **Step 1: Write failing tests for `readApiErrorMessage`**

```ts
import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "./api-error";

describe("readApiErrorMessage", () => {
  it("reads error string from JSON", async () => {
    const res = new Response(JSON.stringify({ error: "Nope" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readApiErrorMessage(res)).resolves.toBe("Nope");
  });

  it("returns null for non-JSON", async () => {
    const res = new Response("plain", { status: 500 });
    await expect(readApiErrorMessage(res)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Implement `apps/web/app/lib/api-error.ts`**

```ts
import type { ToastFn } from "@/app/components/toast-provider";

export async function readApiErrorMessage(
  res: Response
): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string") return data.error;
  } catch {
    // non-JSON
  }
  return null;
}

export async function toastMutationFailure(
  toast: ToastFn,
  res: Response | null,
  label: string
): Promise<void> {
  if (res == null) {
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
```

Remove local `readErrorMessage` from `use-grocery-logic.ts` and import `readApiErrorMessage` instead.

- [ ] **Step 3: Wire silent-fail call sites**

Pattern for each handler:

```ts
const toast = useToast();
// ...
try {
  const res = await fetch(...);
  if (res.ok) {
    // existing success path
    return;
  }
  await toastMutationFailure(toast, res, "Update role");
} catch {
  await toastMutationFailure(toast, null, "Update role");
} finally {
  // existing
}
```

Exact labels:
| Location | Label |
|----------|-------|
| `member-role-manager` role change | `Update role` |
| `member-role-manager` transfer | `Transfer ownership` |
| `member-role-manager` remove | `Remove member` |
| `member-role-manager` summary fetch | `Load member summary` |
| `recurring-list` toggle | `Update recurring rule` |
| `recurring-list` delete | `Delete recurring rule` |
| `budget-list` delete | `Delete budget` |
| `calendar` fetchEvents | `Load calendar` |

For calendar, also set a small `loadError` string state (optional but better UX than toast-only on month nav). Minimum acceptable: toast via `toastMutationFailure`. Prefer:

```ts
const [loadError, setLoadError] = useState<string | null>(null);
// on failure: setLoadError("Couldn't load this month"); toast...
// on success: setLoadError(null)
// render loadError under the month header if set
```

- [ ] **Step 4: Run unit tests + typecheck**

Run:

```bash
pnpm --filter @amigo/web exec vitest run app/lib/api-error.test.ts app/lib/offline/
pnpm --filter @amigo/web run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib/api-error.ts \
  apps/web/app/lib/api-error.test.ts \
  apps/web/app/components/groceries/use-grocery-logic.ts \
  apps/web/app/components/settings/member-role-manager.tsx \
  apps/web/app/components/recurring-list.tsx \
  apps/web/app/components/budget-list.tsx \
  apps/web/app/components/calendar.tsx
git commit -m "$(cat <<'EOF'
fix(ui): surface mutation failures instead of failing silently

EOF
)"
```

---

### Task 6: Final verification

**Files:** none new

- [ ] **Step 1: Run full web unit + lint for touched areas**

```bash
pnpm --filter @amigo/web run test:unit
pnpm run lint
pnpm --filter @amigo/web run typecheck
```

Expected: all green.

- [ ] **Step 2: Manual checklist**

1. Groceries offline add → reload while offline → item still listed.
2. Groceries offline toggle/delete → reload → state preserved.
3. Go online → success toast for synced count.
4. (Optional) Force discard by manually setting a `syncQueue` row’s `retryCount` to `5` in DevTools IndexedDB → trigger flush → error toast about discarded change.
5. Members / recurring toggle / budget delete with server forced 500 (or offline without queue) → error toast, not silence.
6. Calendar month navigation failure → user-visible feedback.

- [ ] **Step 3: Final commit only if verification produced fixups; otherwise done**

If fixups were needed, commit them with a message describing the fix. Do not create an empty commit.

---

## Self-review

**Spec coverage (Track A):**
| Track A item | Task |
|--------------|------|
| Persist offline grocery overlays into Dexie + hydrate from queue | Tasks 1–2 |
| Toast permanently failed sync mutations | Task 3 |
| Isolate per-household errors in recurring cron | Task 4 |
| Unify mutation error toasts (port grocery pattern) | Task 5 |

**Placeholder scan:** none intentionally left.

**Type consistency:** `processSyncQueue` return gains `discarded`; `processDueRecurringRules` return gains `failed`; UI helpers use `ToastFn` from `toast-provider.tsx`.

**Deferred (not Track A):** offline for financial domains, WebSocket app-shell mount, invite flow, audit UI, Origin/Bearer for iOS.
