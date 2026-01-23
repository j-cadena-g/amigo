# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

amigo is a self-hosted household management application for 2 users (James (AKA - Jaime) and Valentina). It's a TypeScript monorepo using Turborepo, deployed on Proxmox via Docker + Tailscale.

## Tech Stack

- **Runtime:** Bun (latest)
- **Language:** TypeScript 5.7+ (strict mode, no `any` types permitted)
- **Frontend:** Next.js 15+ (App Router), React 19, Tailwind CSS 4.0, Shadcn/UI
- **Backend:** Hono for WebSockets/sync, Next.js Server Actions for mutations
- **Database:** PostgreSQL 17 with Drizzle ORM, Valkey 8 for sessions/pub-sub
- **Validation:** Zod (single source of truth via drizzle-zod)
- **Infrastructure:** Docker Compose, Caddy (DNS-01 SSL via Cloudflare), Tailscale

## Common Commands

```bash
# Dependencies
bun install

# Development (local hot reload - fastest)
make dev-local         # Run Next.js locally with Docker DB/Valkey
make dev-local-all     # Run all apps locally (web + api)

# Development (containerized)
make dev-up            # Start web-dev, api-dev containers
make dev-logs          # Tail dev container logs

# Database
bun db:generate        # Generate migrations from schema changes
bun db:migrate         # Apply pending migrations
make db-studio         # Open Drizzle Studio for DB inspection

# Testing (use `bun run test`, NOT `bun test`)
bun run test           # Unit + Integration tests (Vitest via Turbo)
bun run test:e2e       # E2E tests (Playwright)
bun run test:coverage  # Coverage report

# Run single test file
cd apps/api && bun run vitest run src/routes/__tests__/health.test.ts
cd apps/api && bun run vitest --watch  # Watch mode

# NOTE: `bun test` (without `run`) uses Bun's native test runner which
# doesn't support vitest features like vi.hoisted(). Always use `bun run test`.

# Quality
bun run lint
bun run typecheck

# Production (Makefile)
make deploy            # Build, start, and migrate
make prod-logs         # View production logs
```

## Project Structure

```text
amigo/
├── apps/
│   ├── web/                  # Next.js 15 App Router
│   │   └── src/
│   │       ├── app/          # Routes (Server Components)
│   │       ├── actions/      # Server Actions (direct DB access)
│   │       ├── components/   # Client Components
│   │       └── lib/          # Hono RPC client setup
│   └── api/                  # Hono server (WebSockets/sync)
│       └── src/
│           ├── routes/       # RPC routes (sync/health)
│           ├── ws/           # WebSocket handlers
│           └── index.ts      # Exports AppType for RPC
├── packages/
│   ├── db/                   # Drizzle ORM (source of truth)
│   │   └── src/schema/       # Table definitions
│   ├── types/                # Shared types (drizzle-zod exports)
│   └── ui/                   # Shared Shadcn components
└── docker/
```

## Architecture Principles

### Type Safety Chain

Database Schema (`packages/db`) → Zod Schema (`packages/types`) → API Types → Frontend Props

Always modify `packages/db/schema` first, then regenerate types. Never manually edit inferred types.

### Hybrid Data Access Pattern

| Context | Access Method | Why |
| --- | --- | --- |
| Server Components | Direct DB via `@amigo/db` | Lowest latency, no HTTP overhead |
| Client Components | Hono RPC client | Type-safe fetching for browser |
| Mutations | Server Actions and Valkey publish | Direct DB write, then broadcast |

### Code Organization

* Server Components import `@amigo/db` directly for reads
* Client Components use `@amigo/api` RPC client for reads
* Server Actions import `@amigo/db` directly, publish to Valkey for real-time sync
* Hono (`apps/api`) handles WebSockets and delta sync only

### Multi-tenancy

Row-Level Security (RLS) enforced at database level using `household_id` on all data tables.

### Security Patterns

* **Rate Limiting:** Redis-backed with in-memory fallback; applied to both API routes and Server Actions
* **Input Validation:** All inputs validated with Zod; use schemas from `@amigo/types`
* **Error Handling:** Use `logServerError()` for errors, `logSecurityEvent()` for security-sensitive operations
* **Length Constraints:** String inputs must have `.max()` matching DB column sizes
* **Audit Logging:** Security events (restore, fresh-start) logged via `logSecurityEvent()`

### Permissions (RBAC)

Role hierarchy: **owner** (3) > **admin** (2) > **member** (1)

* Use `hasRole(session, minRole)` for simple role checks
* Use `canManageHousehold()`, `canManageMembers()`, `canTransferOwnership()` for specific permissions
* Use `assertPermission(check, message)` for guard clauses that throw on failure
* Owner role can only be changed via ownership transfer
* Users cannot change their own role

## Key Patterns

* **Optimistic UI:** Grocery list uses React 19's `useOptimistic` for instant feedback
* **Real-time:** Server Action → Valkey pub → Hono subscription → WebSocket broadcast
* **Delta Sync:** Reconnection fetches only records where `updated_at > lastSyncTimestamp`
* **Soft Deletes:** Tables use `deleted_at` column for delta sync compatibility
* **PWA/Offline:** Dexie (IndexedDB) stores groceries offline, syncs on reconnect
* **Multi-Currency:** 5 currencies (CAD, USD, EUR, GBP, MXN) with exchange rate tracking

### Server Action Pattern

Server Actions in `apps/web/src/actions/` follow this pattern for real-time sync:

```typescript
"use server"
import { db, groceryItems } from "@amigo/db";
import { getSession } from "@/lib/session";
import { publishHouseholdUpdate } from "@/lib/redis";
import { revalidatePath } from "next/cache";

export async function addGroceryItem(name: string) {
  const session = await getSession();  // Get session from Valkey

  const [item] = await db.insert(groceryItems).values({
    householdId: session.householdId,
    createdByUserId: session.userId,
    itemName: name,
  }).returning();

  // Broadcast to other clients via WebSocket
  await publishHouseholdUpdate({
    householdId: session.householdId,
    type: "GROCERY_UPDATE",
    action: "create",
    entityId: item.id,
  });

  revalidatePath("/groceries");
  return item;
}
```

### RLS Context

Database queries that need RLS scoping use `withRLS`:

```typescript
import { db, withRLS, transactions, eq } from "@amigo/db";

// Queries automatically scoped to household
const results = await withRLS(session.householdId, async () => {
  return db.select().from(transactions).where(eq(transactions.userId, userId));
});
```

## Domain

* **Prod:** `amigo.cadenalabs.net`
* **Dev:** `dev-amigo.cadenalabs.net`
* **Cookie scope:** `.cadenalabs.net`

## Server Actions

All actions in `apps/web/src/actions/`:

| File | Purpose |
|------|---------|
| `groceries.ts` | Grocery list CRUD, bulk operations |
| `transactions.ts` | Financial transaction management |
| `budgets.ts` | Budget creation and tracking |
| `recurring.ts` | Recurring transaction rules |
| `assets.ts` | Asset tracking |
| `debts.ts` | Debt tracking |
| `tags.ts` | Grocery category tags |
| `calendar.ts` | Calendar events |
| `members.ts` | Household member management, role changes |
| `settings.ts` | Household settings |
| `restore.ts` | Account restoration and fresh-start |
| `push.ts` | Push notification subscriptions |
| `audit.ts` | Audit history retrieval |

## API Routes (Hono)

| Route | Purpose |
|-------|---------|
| `/api/groceries` | Delta sync for grocery list |
| `/api/transactions` | Paginated transaction fetch |
| `/api/health` | Health check (DB + Valkey) |
| `/ws` | WebSocket for real-time updates |

## Rate Limiting

Presets in `apps/web/src/lib/rate-limit.ts`:

| Preset | Limit | Use Case |
|--------|-------|----------|
| `MUTATION` | 30/min | Standard add/update/delete |
| `BULK` | 10/min | Bulk operations |
| `SENSITIVE` | 10/min | Settings, member management |
| `READ` | 60/min | List operations |

Usage: `await enforceRateLimit("action-name", RATE_LIMIT_PRESETS.MUTATION);`

## Error Handling

```typescript
import { ActionError, logServerError, logSecurityEvent } from "@/lib/errors";

// Throw client-safe errors
throw new ActionError("Item not found", "NOT_FOUND");

// Log server errors (not exposed to client)
logServerError("groceries", error, { itemId });

// Log security events (audit trail)
logSecurityEvent("account_restored", { userId, email });
```

Safe error codes: `UNAUTHORIZED`, `VALIDATION_ERROR`, `RATE_LIMITED`, `PERMISSION_DENIED`, `NOT_FOUND`

## Offline Sync (Dexie)

Files in `apps/web/src/lib/offline/`:

* **Per-item metadata:** `_localVersion`, `_serverVersion`, `_syncStatus`
* **Conflict resolution:** server-wins (newer/deleted), local-wins (never synced), merge (field-level)
* **Sync queue:** Stores pending mutations, max 5 retries
* **Delta sync:** Fetches `updated_at > lastSyncTimestamp`

## Push Notifications

* **Batching:** Groups events within 7-second window before sending
* **Smart messages:** "Added 3 items" vs individual notifications
* **Actor filtering:** Skips notifications to the user who made changes
* **Stale cleanup:** Removes subscriptions inactive >7 days

## WebSocket (useWebSocket Hook)

* **Reconnection:** Exponential backoff (1s → 30s max), 10 attempts
* **Keepalive:** Ping/pong every 30 seconds
* **Session revalidation:** Server checks sessions every 5 minutes
* **Logout propagation:** Sessions invalidated via Redis pub/sub

## Account Recovery

Two paths for soft-deleted users:

1. **Restore:** Reactivate user, reconnect to all orphaned data
2. **Fresh Start:** Reactivate as member, transfer data to owner

Pending token: 15-min TTL in Valkey

## Audit Logging

PostgreSQL triggers auto-log all changes:

* Stored in `auditLogs` table with old/new values (JSONB)
* Attribution via `app.current_user_auth_id` session config
* Query with `getRecordHistory(recordId, tableName)`
