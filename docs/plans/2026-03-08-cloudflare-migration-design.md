# Cloudflare Migration Design

**Date:** 2026-03-08
**Status:** Draft
**Scope:** Full migration from self-hosted Docker/Next.js to Cloudflare Workers

## 1. Overview

Migrate amigo from a self-hosted Docker + Next.js + PostgreSQL + Valkey + Authentik stack to a fully Cloudflare-native architecture running as a single Cloudflare Worker.

### What Changes

| Concern | Current | Target |
|---------|---------|--------|
| **Framework** | Next.js 15 (App Router) | React Router v7 (framework mode on Cloudflare Workers) |
| **Runtime** | Bun on Docker | Cloudflare Workers (V8 isolates) |
| **Database** | PostgreSQL 17 + Drizzle | Cloudflare D1 (SQLite) + Drizzle |
| **Auth** | Authentik (OIDC, self-hosted) | Clerk |
| **Sessions** | Valkey (Redis fork) | Clerk (auth) + Cloudflare KV (app state) |
| **Real-time** | Valkey pub/sub + WebSocket (Hono/Bun) | Durable Objects (WebSocket Hibernation API) |
| **Rate limiting** | Redis-backed + in-memory fallback | KV-backed |
| **RLS** | PostgreSQL session variables + policies | Application-level middleware (Drizzle query filters) |
| **Audit logging** | PostgreSQL triggers | Application-level (Drizzle insert in mutation helpers) |
| **Offline/PWA** | Dexie + Serwist service worker | Dexie + Vite PWA plugin (adapted) |
| **Push notifications** | web-push (VAPID) | Dropped (re-add later) |
| **Deployment** | Docker Compose + Caddy + Tailscale | `wrangler deploy` |
| **Reverse proxy** | Caddy (standalone) | Cloudflare (built-in) |
| **Identity provider** | Authentik (standalone) | Clerk (SaaS) |

### What Stays the Same

- TypeScript strict mode, no `any` types
- Drizzle ORM (switches driver from `postgres-js` to `d1`)
- Zod validation via `drizzle-zod` (source of truth in `packages/types`)
- Shadcn/UI component library (`packages/ui`)
- Tailwind CSS 4.0
- React 19
- Dexie (IndexedDB) for offline grocery sync
- RBAC model: owner > admin > member
- Soft deletes via `deletedAt` for delta sync
- Multi-currency support (CAD, USD, EUR, GBP, MXN)
- All existing features: groceries, transactions, budgets, recurring, debts, assets, calendar, settings, account recovery

## 2. Architecture

### Single Worker Model

All requests hit one Cloudflare Worker. `worker.ts` owns the platform entrypoint, routes `/ws` upgrades and scheduled jobs directly, and delegates application HTTP handling to React Router's `createRequestHandler`.

```
                    Cloudflare Edge
                    ┌─────────────────────────────────────────┐
                    │                                         │
  Client ──────────►│  Worker (`createRequestHandler`)        │
                    │  ├── /api/*  → RR resource routes       │
                    │  ├── /ws    → Durable Object upgrade    │
                    │  └── /*     → SSR React app             │
                    │                                         │
                    │  Bindings:                               │
                    │  ├── DB        (D1 database)             │
                    │  ├── CACHE     (KV namespace)            │
                    │  └── HOUSEHOLD (Durable Object)          │
                    └─────────────────────────────────────────┘
```

**Request flow:**

1. Every request enters through `worker.ts`
2. `/ws` upgrades stay Worker-owned and proxy directly to the Durable Object stub
3. `scheduled` events and security headers stay Worker-owned concerns
4. All other requests flow through React Router root middleware for Clerk auth + app context resolution
5. `/api/*` routes are handled by React Router resource routes and page requests SSR the React app before hydration

### SSR Strategy

Use React Router v7 framework mode directly from the Cloudflare Worker entry. This gives us:
- React Router v7 in framework mode for file-based routing, loaders, actions, middleware, and resource routes
- Worker-owned platform concerns (`scheduled`, security headers, `/ws`, Durable Object exports)
- `AppLoadContext` with Cloudflare bindings and app session data available inside loaders/actions
- Vite builds both client and server bundles
- `@cloudflare/vite-plugin` provides local Workers runtime with full bindings

## 3. Project Structure

```
amigo/
├── app/                          # React Router v7 routes (framework mode)
│   ├── routes/                   # File-based routes
│   │   ├── _index.tsx            # Landing / login
│   │   ├── dashboard.tsx         # Main dashboard
│   │   ├── groceries.tsx         # Grocery list
│   │   ├── budget.tsx            # Budget layout
│   │   ├── budget.transactions.tsx
│   │   ├── budget.budgets.tsx
│   │   ├── budget.recurring.tsx
│   │   ├── debts.tsx
│   │   ├── assets.tsx
│   │   ├── calendar.tsx
│   │   ├── settings.tsx
│   │   └── restore-account.tsx
│   ├── components/               # React components (client + shared)
│   │   ├── ui/                   # Shadcn primitives (from packages/ui)
│   │   ├── groceries/            # Grocery-specific components
│   │   ├── budget/               # Budget-specific components
│   │   └── layout/               # Shell, nav, sidebar
│   ├── lib/                      # Client-side utilities
│   │   ├── offline/              # Dexie DB, sync processor, conflict resolver
│   │   ├── websocket.ts          # useWebSocket hook (connects to DO)
│   │   └── utils.ts              # Client helpers
│   ├── root.tsx                  # Root layout (html, head, body)
│   └── entry.client.tsx          # Client hydration entry
├── server/                       # Worker-only server code
│   ├── middleware/
│   │   ├── app-context.ts        # CSP + app session resolution
│   │   └── rate-limit.ts         # KV-backed rate limiting
│   ├── api/                      # /api/* resource-route handlers
│   │   ├── groceries.ts          # Delta sync endpoint
│   │   ├── transactions.ts       # Paginated fetch
│   │   └── health.ts             # Health check
│   ├── lib/
│   │   ├── db.ts                 # D1 + Drizzle setup, withRLS, withAuditContext
│   │   ├── permissions.ts        # RBAC helpers (port existing)
│   │   ├── errors.ts             # ActionError, logging (port existing)
│   │   └── realtime.ts           # Durable Object client helpers
│   └── durable-objects/
│       └── household.ts          # HouseholdDO class (WebSocket hub)
├── packages/
│   ├── db/                       # Drizzle schema (SQLite dialect)
│   │   ├── src/schema/           # Table definitions
│   │   └── drizzle.config.ts     # D1 HTTP driver config
│   └── types/                    # Zod schemas (drizzle-zod)
├── worker.ts                     # Worker entry: request handler + DO classes
├── wrangler.jsonc                # Cloudflare bindings config
├── vite.config.ts                # Vite + cloudflare plugin + RR7 adapter
├── react-router.config.ts        # React Router v7 config
├── package.json                  # Single package (no more turborepo)
└── tsconfig.json
```

### Key structural decisions

- **Monorepo simplification:** `apps/web` and `apps/api` merge. Turborepo is no longer needed since there's only one deployable unit. `packages/db` and `packages/types` stay as workspace packages for schema/type isolation.
- **`packages/ui` inlined:** Shadcn components move into `app/components/ui/`. No need for a separate package when there's one app.
- **Server/client split:** `server/` contains all Worker-side code (never ships to browser). `app/` contains route components, client libs, and shared React code.
- **Actions pattern:** React Router loaders/actions and resource routes call shared server helpers directly for validation, auth checks, DB mutations, and Durable Object notifications.

## 4. Database Migration (PostgreSQL → D1/SQLite)

### Schema Adaptations

Every table needs conversion from `drizzle-orm/pg-core` to `drizzle-orm/sqlite-core`. Here are the specific changes:

#### Type mappings

| PostgreSQL (current) | SQLite (target) | Notes |
|---------------------|-----------------|-------|
| `uuid("id").primaryKey().defaultRandom()` | `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` | No native UUID in SQLite |
| `pgEnum("user_role", [...])` | `text("role", { enum: ["owner", "admin", "member"] })` | SQLite has no enum type; use text with check constraint |
| `timestamp("x", { withTimezone: true })` | `integer("x", { mode: "timestamp_ms" })` | Store as Unix ms; SQLite has no native timestamp |
| `numeric("amount", { precision: 12, scale: 2 })` | `real("amount")` | Or store as integer cents for precision |
| `jsonb("keys")` | `text("keys", { mode: "json" })` | SQLite stores JSON as text |
| `date("date", { mode: "date" })` | `text("date")` | Store as ISO 8601 string (YYYY-MM-DD) |
| `boolean("x")` | `integer("x", { mode: "boolean" })` | SQLite uses 0/1 |

#### Money handling decision

Store monetary amounts as **integer cents** (not floats) to avoid floating-point precision issues:
- `amount: numeric("amount", { precision: 12, scale: 2 })` → `amount: integer("amount")` where `1234` = $12.34
- Exchange rates: `real("exchange_rate_to_home")` (floats acceptable for rates, not balances)
- All existing amount values multiply by 100 during data migration

#### Tables to convert (13 total)

1. **households** — straightforward conversion, `currencyEnum` → `text` with enum constraint
2. **users** — `userRoleEnum` → `text` enum, UUID → text with `crypto.randomUUID()`
3. **transactions** — `transactionTypeEnum` → text, amounts → integer cents
4. **groceryItems** — boolean → integer mode, timestamps → integer ms
5. **groceryTags** — straightforward
6. **groceryItemTags** — composite PK stays (supported in SQLite)
7. **budgets** — `budgetPeriodEnum` → text, amounts → integer cents
8. **recurringTransactions** — `recurringFrequencyEnum` → text, dates → text ISO strings
9. **debts** — `debtTypeEnum` → text, amounts → integer cents
10. **assets** — `assetTypeEnum` → text, amounts → integer cents
11. **exchangeRates** — composite PK stays, rate → real
12. **auditLogs** — `jsonb` → `text` JSON mode
13. **pushSubscriptions** — keep schema but table unused (push notifications dropped)

#### Example conversion (users table)

```typescript
// BEFORE (PostgreSQL)
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authId: text("auth_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// AFTER (SQLite/D1)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  authId: text("auth_id").notNull().unique(),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
```

### RLS Replacement

PostgreSQL RLS is enforced via `set_config('app.current_household_id', ...)`. D1/SQLite has no RLS.

**Replacement: Application-level query scoping.**

Create a `withHousehold` helper that wraps all queries with a mandatory `householdId` filter:

```typescript
// server/lib/db.ts
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "@amigo/db";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// All data queries MUST use this helper — it adds householdId filter
export function scopeToHousehold<T extends { householdId: string }>(
  table: T,
  householdId: string
) {
  return eq(table.householdId, householdId);
}
```

Every query that previously relied on RLS now explicitly includes the household filter. This is enforced through multiple layers:

**Static enforcement via ESLint:**

Add a `no-restricted-syntax` rule (or a custom ESLint rule) that flags direct `db.select().from(<table>)` calls on household-scoped tables without a `.where()` containing `householdId`. This catches most omissions at lint time before code review.

```jsonc
// eslint.config.ts (simplified example)
{
  "rules": {
    "no-restricted-syntax": ["error", {
      "selector": "CallExpression[callee.property.name='from'][parent.type!='CallExpression']",
      "message": "Use scopeToHousehold() — direct .from() on household-scoped tables is forbidden."
    }]
  }
}
```

**Type-level enforcement:**

Make `scopeToHousehold` return a branded/opaque type so that action handlers *must* pass through it to produce a valid query result. If a developer skips the helper, the return type won't match what downstream code expects, causing a compile error.

```typescript
// Branded type that proves household scoping was applied
type HouseholdScoped<T> = T & { readonly __householdScoped: true };

export function scopedQuery<T>(
  db: DrizzleD1,
  householdId: string,
  queryFn: (scope: typeof scopeToHousehold) => Promise<T>
): Promise<HouseholdScoped<T>> {
  return queryFn((table) => scopeToHousehold(table, householdId)) as Promise<HouseholdScoped<T>>;
}

// Action handlers must return HouseholdScoped<T> — enforced by type signatures
```

This provides defense-in-depth: ESLint catches obvious misses, TypeScript catches structural misses, and code review catches edge cases.

### Audit Logging Replacement

PostgreSQL triggers auto-log all changes. D1 has no triggers.

**Replacement: Application-level audit logging in mutation helpers.**

```typescript
// server/lib/audit.ts
export async function withAudit<T>(
  db: DrizzleD1,
  opts: {
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    oldValues?: unknown;
    newValues?: unknown;
    changedBy: string;
  },
  mutation: () => Promise<T>
): Promise<T> {
  const result = await mutation();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tableName: opts.tableName,
    recordId: opts.recordId,
    operation: opts.operation,
    oldValues: opts.oldValues ? JSON.stringify(opts.oldValues) : null,
    newValues: opts.newValues ? JSON.stringify(opts.newValues) : null,
    changedBy: opts.changedBy,
    createdAt: new Date(),
  });
  return result;
}
```

Every server action calls `withAudit()` around its DB mutation. This replaces the automatic PostgreSQL trigger behavior with explicit calls.

### Migration Workflow

```bash
# Generate migrations from schema changes
bun run db:generate

# Apply to local D1 (wrangler dev creates a local SQLite)
wrangler d1 migrations apply amigo-db --local

# Apply to production D1
wrangler d1 migrations apply amigo-db --remote
```

## 5. Authentication (Authentik → Clerk)

### Current Flow (Authentik OIDC)

1. User clicks login → server generates PKCE challenge → redirects to Authentik
2. Authentik authenticates → redirects back with auth code
3. Server exchanges code for tokens → fetches userinfo (sub, email, name)
4. Creates/updates user in DB → creates session in Valkey → sets cookie

### New Flow (Clerk)

1. User visits app → Clerk's `<SignIn />` component handles UI
2. Clerk authenticates (email/password, social, etc.) → sets session cookie
3. React Router root middleware (`clerkMiddleware()`) validates the session token on requests that reach the app
4. On first authenticated request: create user + household in D1 if not exists
5. App session data (householdId, role) stored in KV keyed by Clerk userId

### Integration Points

**React Router root middleware (`app/root.tsx`, `server/middleware/app-context.ts`):**

```typescript
import { clerkMiddleware } from "@clerk/react-router/server";
import { appContextMiddleware } from "./server/middleware/app-context";

export const middleware = [clerkMiddleware(), appContextMiddleware];
```

**First-login user provisioning (`server/middleware/household.ts`):**

```typescript
// After Clerk auth, resolve app-level session from KV
async function resolveAppSession(c: Context) {
  const { userId } = getAuth(c);
  const cached = await c.env.CACHE.get(`session:${userId}`, "json") as AppSession | null;

  if (cached) {
    // Guard against stale KV sessions (eventual consistency — up to 60s lag).
    // If a user was removed from a household, the KV entry may linger at some
    // edge nodes. Verify membership against D1 as a fallback.
    const membership = await db.select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.authId, userId),
        eq(users.householdId, cached.householdId),
        isNull(users.deletedAt),
      )).get();

    if (membership) return cached;

    // Stale session — evict from KV and fall through to DB lookup
    await c.env.CACHE.delete(`session:${userId}`);
  }

  // Check DB for existing user
  let user = await db.select().from(users)
    .where(and(eq(users.authId, userId), isNull(users.deletedAt))).get();

  if (!user) {
    // First login: create household + user
    const household = await db.insert(households).values({...}).returning().get();
    user = await db.insert(users).values({
      authId: userId,
      householdId: household.id,
      role: "owner",
      ...
    }).returning().get();
  }

  const session = { userId: user.id, householdId: user.householdId, role: user.role, ... };
  await c.env.CACHE.put(`session:${userId}`, JSON.stringify(session), { expirationTtl: 86400 });
  return session;
}
```

**Client-side:** Use `@clerk/react-router` for the React Router v7 integration (provides `<ClerkProvider>`, `<SignIn>`, `<SignUp>`, `<UserButton>`, etc.).

### User model mapping

| Current (Authentik) | New (Clerk) |
|---------------------|-------------|
| `authId` = OIDC `sub` claim | `authId` = Clerk `userId` |
| Email/name from userinfo endpoint | Email/name from Clerk user object |
| Session in Valkey (7-day TTL) | Auth session managed by Clerk; app session in KV (24h TTL) |
| Cookie: `amigo-session` (httpOnly) | Cookie: managed by Clerk SDK |

### What gets removed

- `apps/web/src/app/api/auth/login/route.ts` — Clerk handles login UI
- `apps/web/src/app/api/auth/callback/route.ts` — No OIDC callback needed
- `apps/web/src/app/api/auth/logout/route.ts` — Clerk handles logout
- `apps/web/src/lib/auth.ts` — OIDC discovery/config no longer needed
- `openid-client` dependency — removed entirely

## 6. Real-time Sync (Valkey → Durable Objects)

### Current Architecture

```
Server Action → publishHouseholdUpdate() → Valkey pub/sub
   → Hono API server subscribes → broadcasts to WebSocket clients
```

### New Architecture

```
RR7 Action → Durable Object stub.fetch() → HouseholdDO
   → HouseholdDO broadcasts to all connected WebSocket clients
```

### HouseholdDO (Durable Object)

One Durable Object instance per household. It:
- Manages WebSocket connections for all household members
- Uses the Hibernation API (no billing while idle)
- Broadcasts updates to all connected clients when notified
- Auto-handles ping/pong keepalive

```typescript
// server/durable-objects/household.ts
import { DurableObject } from "cloudflare:workers";

export class HouseholdDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      // WebSocket upgrade
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const userId = url.searchParams.get("userId");
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ userId, connectedAt: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast") {
      // Called by server actions to broadcast updates
      const payload = await request.json();
      for (const ws of this.ctx.getWebSockets()) {
        ws.send(JSON.stringify(payload));
      }
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Client-to-server messages (if needed for bidirectional sync)
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}
```

### Broadcasting from Actions

```typescript
// server/lib/realtime.ts
export async function broadcastToHousehold(
  env: Env,
  householdId: string,
  payload: HouseholdUpdatePayload
) {
  const id = env.HOUSEHOLD.idFromName(householdId);
  const stub = env.HOUSEHOLD.get(id);
  await stub.fetch(new Request("https://do/broadcast", {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}
```

### Client WebSocket Hook

The existing `useWebSocket` hook adapts to connect to the Worker's `/ws` endpoint, which upgrades to the Durable Object:

```typescript
// Worker route for WebSocket upgrade
app.get("/ws", async (c) => {
  const session = c.get("appSession");
  const id = c.env.HOUSEHOLD.idFromName(session.householdId);
  const stub = c.env.HOUSEHOLD.get(id);
  return stub.fetch(new Request(`https://do/ws?userId=${session.userId}`, {
    headers: request.headers, // Forward Upgrade headers
  }));
});
```

### What changes for the client

- WebSocket URL: from `wss://api.amigo.../ws` to `wss://amigo.../ws` (same origin)
- Session validation: Clerk token validated before upgrade (in Worker, not in DO)
- Reconnection logic: same exponential backoff, same hook API
- Delta sync endpoint: same `/api/groceries?lastSync=...` pattern

## 7. Session & State Management

### KV Schema

```
session:{clerkUserId}  → { userId, householdId, role, email, name }  TTL: 24h
rate:{ip}:{action}     → { count, resetAt }                         TTL: 60s
```

- **Auth sessions:** Managed entirely by Clerk (cookie-based, automatic refresh)
- **App sessions:** Stored in KV, keyed by Clerk userId. Contains householdId, role, and app-specific context. Invalidated on role change, household change, or user deletion.
- **Rate limiting:** KV with TTL for sliding window counters per IP per action.

### Session Invalidation

When a user's role changes or they're removed from a household:
1. Delete their KV session entry
2. Broadcast a `SESSION_INVALIDATED` message via the HouseholdDO
3. Client receives the message and forces a re-auth / redirect

## 8. Exchange Rate Caching (Redis → Cache API + D1)

### Current Architecture

`exchange-rates.ts` uses a three-tier cache: Redis (24h TTL) → PostgreSQL (historical) → external API fallback. Redis provides hot caching for frequently accessed currency pairs.

### New Architecture

Replace Redis with the **Cloudflare Cache API** (`caches.default`) for hot caching, with D1 as the persistent store:

| Tier | Current | Target | Notes |
|------|---------|--------|-------|
| Hot cache | Redis (`SETEX`, 24h TTL) | `caches.default` (Cache API) | Free, per-colo, automatic eviction |
| Persistent store | PostgreSQL `exchangeRates` table | D1 `exchangeRates` table | Same schema, SQLite types |
| Fallback | `exchangerate-api.com` | `exchangerate-api.com` | No change |

**Why Cache API over KV:**
- Cache API is free (no reads/writes billing) and available in all Workers
- Exchange rates are read-heavy, rarely written — perfect for Cache API's per-colo caching
- KV's eventual consistency (up to 60s) is fine for rates, but Cache API is faster for same-colo requests
- Keeps KV usage focused on sessions and rate limiting (simpler to reason about)

```typescript
// server/lib/exchange-rates.ts
const CACHE_TTL = 86400; // 24 hours

export async function getExchangeRate(
  env: Env,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<ExchangeRateResult> {
  if (fromCurrency === toCurrency) {
    return { rate: 1, date: new Date(), cached: true };
  }

  const dateStr = getTodayDateStr();
  const cacheUrl = `https://cache.internal/exchange-rate/${fromCurrency}/${toCurrency}/${dateStr}`;
  const cache = caches.default;

  // 1. Check Cache API
  const cached = await cache.match(cacheUrl);
  if (cached) {
    const { rate } = await cached.json() as { rate: number };
    return { rate, date: new Date(dateStr), cached: true };
  }

  // 2. Check D1
  const db = getDb(env.DB);
  const dbRate = await db.select().from(exchangeRates)
    .where(and(
      eq(exchangeRates.baseCurrency, fromCurrency),
      eq(exchangeRates.targetCurrency, toCurrency),
      eq(exchangeRates.date, dateStr),
    )).get();

  if (dbRate) {
    await cache.put(cacheUrl, Response.json({ rate: dbRate.rate }), {
      headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
    });
    return { rate: dbRate.rate, date: new Date(dateStr), cached: true };
  }

  // 3. Fetch from external API
  const rates = await fetchFromApi(fromCurrency);
  const rate = rates[toCurrency];
  if (!rate) throw new Error(`Rate not found: ${fromCurrency} → ${toCurrency}`);

  // Store in D1 + Cache API
  await db.insert(exchangeRates).values({
    baseCurrency: fromCurrency,
    targetCurrency: toCurrency,
    date: dateStr,
    rate,
  }).onConflictDoNothing();

  await cache.put(cacheUrl, Response.json({ rate }), {
    headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
  });

  return { rate, date: new Date(dateStr), cached: false };
}
```

The `cacheUrl` is a synthetic URL (never actually fetched) — the Cache API uses it as a key. This is the standard pattern for Workers Cache API usage.

## 9. Rate Limiting (Redis → KV)

Port the existing presets but back with KV instead of Redis:

| Preset | Limit | Use Case |
|--------|-------|----------|
| `MUTATION` | 30/min | Standard add/update/delete |
| `BULK` | 10/min | Bulk operations |
| `SENSITIVE` | 10/min | Settings, member management |
| `READ` | 60/min | List operations |

```typescript
// server/middleware/rate-limit.ts
export async function enforceRateLimit(
  kv: KVNamespace,
  key: string,
  preset: RateLimitPreset
): Promise<void> {
  const record = await kv.get(`rate:${key}`, "json") as RateRecord | null;
  const now = Date.now();

  if (!record || now > record.resetAt) {
    await kv.put(`rate:${key}`, JSON.stringify({ count: 1, resetAt: now + 60000 }), {
      expirationTtl: 60,
    });
    return;
  }

  if (record.count >= preset.limit) {
    throw new ActionError("Too many requests", "RATE_LIMITED");
  }

  await kv.put(`rate:${key}`, JSON.stringify({ count: record.count + 1, resetAt: record.resetAt }), {
    expirationTtl: 60,
  });
}
```

KV is eventually consistent, so rate limiting is approximate (fine for this use case).

## 10. Offline/PWA (Adapted)

### What stays

- **Dexie database:** `amigo-offline` with `groceryItems`, `groceryTags`, `syncQueue`, `syncMetadata` tables
- **Sync processor:** Queue-based mutation sync with retry logic (max 5 retries)
- **Conflict resolution:** Server-wins strategy with field-level merge
- **Delta sync:** `GET /api/groceries?lastSync=<timestamp>` returns items modified after timestamp

### What changes

- **Service worker:** Replace `@serwist/next` with `vite-plugin-pwa` (or manual SW registration)
- **Sync target:** API endpoints are now on the same origin (`/api/groceries` instead of cross-origin)
- **Server actions → API calls:** Offline mutations that previously called Next.js Server Actions now call same-origin API resource routes

### Service Worker Strategy

- **Cache-first** for static assets (JS, CSS, images)
- **Network-first** for API calls and SSR pages
- **Background sync** for queued mutations (using Dexie sync queue, not SyncManager)

### Worker CPU & Subrequest Limits

Cloudflare Workers have hard execution limits that affect sync operations:

| Limit | Free Plan | Workers Paid | Impact |
|-------|-----------|--------------|--------|
| CPU time per request | 10 ms | 30 ms (Standard) | Sync processing must be fast |
| Subrequests per request | 50 | 1,000 | Each D1 query = 1 subrequest |
| Request body size | 100 MB | 100 MB | Not a concern for sync payloads |
| Duration (wall clock) | 30 s | 30 s (Standard) | Plenty for sequential DB writes |

**Risk:** If a user goes offline and queues 50+ grocery mutations, then comes back online, the sync processor currently fires all mutations sequentially in one request. Each mutation involves at least 1 D1 query + 1 audit log insert + 1 Durable Object broadcast = 3+ subrequests. 50 mutations = 150+ subrequests, easily hitting limits.

**Mitigation: Client-side chunked sync.**

The sync processor already processes mutations sequentially (one `processMutation()` call per loop iteration). The adaptation is to limit each sync API call to a fixed batch and let the client loop:

```typescript
// app/lib/offline/sync-processor.ts (adapted)
const SYNC_BATCH_SIZE = 10; // max mutations per API call

export async function processSyncQueue(): Promise<SyncResult> {
  const mutations = await getPendingMutations();
  const batches = chunkArray(mutations, SYNC_BATCH_SIZE);
  let totalProcessed = 0;
  let totalFailed = 0;

  for (const batch of batches) {
    // Each batch = one API call = one Worker invocation
    const result = await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify({ mutations: batch }),
    });
    const { processed, failed } = await result.json();
    totalProcessed += processed;
    totalFailed += failed;

    // Remove successfully synced mutations from Dexie
    for (const m of batch.slice(0, processed)) {
      await removeMutation(m.id);
    }
  }

  return { processed: totalProcessed, failed: totalFailed };
}
```

**Server-side batch endpoint:**

```typescript
// server/api/sync.ts
app.post("/api/sync", async (c) => {
  const { mutations } = await c.req.json();
  // Max 10 mutations per request — enforced server-side too
  const batch = mutations.slice(0, 10);
  let processed = 0;
  let failed = 0;

  for (const mutation of batch) {
    try {
      await processMutation(c, mutation);
      processed++;
    } catch {
      failed++;
    }
  }

  // Single broadcast after all mutations
  if (processed > 0) {
    await broadcastToHousehold(c.env, session.householdId, {
      type: "GROCERY_UPDATE",
      action: "bulk_sync",
      count: processed,
    });
  }

  return c.json({ processed, failed });
});
```

This ensures each Worker invocation stays well within CPU and subrequest limits (10 mutations × ~3 subrequests = ~30 subrequests per request).

## 11. Scheduled Jobs (Cron Triggers)

### Current: Shell Scripts + System Cron

- `scripts/audit-retention.sh` + `scripts/cron/audit-retention.cron` — prunes audit logs older than 90 days
- `scripts/backup.sh` + `scripts/cron/backup.cron` — PostgreSQL `pg_dump` backups

### New: Cloudflare Cron Triggers

**Audit retention** migrates to a Cron Trigger on the Worker. Add a `scheduled()` handler:

```typescript
// worker.ts
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === "0 3 * * 0") {
      // Weekly audit log pruning (Sunday 3 AM UTC)
      const db = drizzle(env.DB);
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(cutoff)));
    }
  },
};

export { HouseholdDO };
```

Add to `wrangler.jsonc`:
```jsonc
"triggers": {
  "crons": ["0 3 * * 0"]
}
```

**Backups:** D1 provides automated daily backups with Point-in-Time Recovery (PITR) out of the box. The custom `pg_dump` backup script and its cron are no longer needed.

### What gets removed

- `scripts/audit-retention.sh` — replaced by Cron Trigger
- `scripts/backup.sh` — replaced by D1 automated backups
- `scripts/cron/` directory — no system cron needed
- `scripts/` directory (if no other scripts remain)

## 12. Cloudflare Configuration

### wrangler.jsonc (see also: Cron Triggers in section 11)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "amigo",
  "main": "./worker.ts",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat"],

  "assets": {
    "directory": "./build/client",
    "binding": "ASSETS"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "amigo-db",
      "database_id": "<created-via-wrangler>",
      "migrations_dir": "packages/db/migrations"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "<created-via-wrangler>"
    }
  ],

  "durable_objects": {
    "bindings": [
      {
        "name": "HOUSEHOLD",
        "class_name": "HouseholdDO"
      }
    ]
  },

  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["HouseholdDO"]
    }
  ],

  "triggers": {
    "crons": ["0 3 * * 0"]
  },

  "vars": {
    "CLERK_PUBLISHABLE_KEY": "pk_live_...",
    "APP_ENV": "production"
  }
}
```

Secrets (set via `wrangler secret put`):
- `CLERK_SECRET_KEY`

### worker.ts

```typescript
import { createRequestHandler } from "react-router";
import { HouseholdDO } from "./server/durable-objects/household";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx, cf: request.cf, caches: globalThis.caches },
      app: { cspNonce: "", sessionStatus: "unauthenticated" },
    });
  },
};

export { HouseholdDO };
```

### Build & Deploy

```bash
# Local development (full Workers runtime with D1, KV, DO bindings)
bun run dev

# Build for production
bun run build

# Deploy
bun run deploy

# Database migrations
bun run db:generate
wrangler d1 migrations apply amigo-db --local   # local
wrangler d1 migrations apply amigo-db --remote  # production
```

## 13. Error Handling

Port existing patterns with minimal changes:

```typescript
// server/lib/errors.ts — same API as current
export class ActionError extends Error {
  constructor(
    public message: string,
    public code: ErrorCode
  ) { super(message); }
}

// Safe error codes (exposed to client)
type ErrorCode = "UNAUTHORIZED" | "VALIDATION_ERROR" | "RATE_LIMITED" | "PERMISSION_DENIED" | "NOT_FOUND";

// logServerError — uses console.log (Workers logs are available in Cloudflare dashboard)
export function logServerError(context: string, error: unknown, meta?: Record<string, unknown>) {
  console.error(JSON.stringify({ context, error: String(error), ...meta, ts: Date.now() }));
}

// logSecurityEvent — write to audit_logs table + console
export function logSecurityEvent(event: string, meta: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...meta, ts: Date.now() }));
}
```

## 14. Permissions (RBAC)

Direct port of existing `permissions.ts`. No changes needed — the logic is pure TypeScript with no runtime dependencies:

- `hasRole(session, minRole)` — check role level
- `canManageHousehold()` — owner/admin
- `canManageMembers()` — owner/admin
- `canTransferOwnership()` — owner only
- `assertPermission(check, message)` — guard clause

Session object shape stays the same, just sourced from KV instead of Valkey.

## 15. What Gets Removed

| Item | Reason |
|------|--------|
| `docker-compose.yaml` | No Docker on Cloudflare |
| `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/web/Dockerfile.dev` | No containers |
| `Makefile` (most targets) | Replaced by `wrangler` CLI + `package.json` scripts |
| `apps/api/` (entire directory) | Merged into `server/` |
| Authentik OIDC code (`auth.ts`, `login/`, `callback/`, `logout/`) | Replaced by Clerk |
| `openid-client` dependency | Not needed with Clerk |
| Valkey/ioredis code (`redis.ts`, session store) | Replaced by KV + Durable Objects |
| `ioredis` dependency | Removed |
| `web-push` dependency | Push notifications dropped |
| Push subscription management (`push.ts` action) | Dropped |
| `@serwist/next` | Replaced by `vite-plugin-pwa` or manual SW |
| PostgreSQL triggers (`packages/db/src/triggers.ts`) | Application-level audit logging |
| `packages/db/src/setup-triggers.ts` | No PostgreSQL triggers in D1 |
| PostgreSQL RLS functions (`withRLS` using `set_config`) | Application-level query scoping |
| `docker/` directory | No Docker infrastructure |
| Turborepo config (`turbo.json`) | Single deployable, no build orchestration needed |
| `postgres` package | Replaced by D1 driver |
| `scripts/audit-retention.sh` | Replaced by Cron Trigger |
| `scripts/backup.sh` | Replaced by D1 automated backups (PITR) |
| `scripts/cron/` directory | No system cron; Cron Triggers instead |
| `.env.example` (current contents) | Rewritten for Cloudflare config (see section 19) |

## 16. Dependencies (New)

| Package | Purpose |
|---------|---------|
| `@clerk/backend` | Clerk server SDK |
| `@clerk/react-router` | Clerk React Router v7 integration |
| `react-router` | Client + server routing |
| `@react-router/dev` | Vite plugin for RR7 framework mode |
| `@cloudflare/vite-plugin` | Local Workers dev with bindings |
| `drizzle-orm` | ORM (already used, switches to D1 driver) |
| `drizzle-kit` | Migration CLI (already used) |
| `vite` | Build tool |

## 17. Data Migration Strategy

For migrating existing data from PostgreSQL to D1:

1. **Export from PostgreSQL:** Custom TypeScript script using `postgres` driver to export all tables as JSON (one file per table)
2. **Transform:** Script to convert timestamps (to Unix ms), amounts (to integer cents). UUIDs and enums need no conversion (already text-compatible)
3. **Import to D1:** Batched INSERT via D1 HTTP API (see chunking strategy below)
4. **Validate:** Checksums on row counts and critical aggregates (total transaction amounts, user counts)

This is a one-time migration. The self-hosted instance can run in parallel during validation.

### D1 Import Limits & Chunking Strategy

D1 and SQLite impose strict limits that make naive bulk imports fail:

| Limit | Value | Impact |
|-------|-------|--------|
| Max request body | 1 MB | Large INSERT batches get rejected |
| SQLite max variable count | ~32,766 per statement | Multi-row INSERTs with many columns hit this quickly |
| `wrangler d1 execute --file` | 100 MB file size limit | Large seed files must be split |
| D1 HTTP API | 100 statements per batch | Must chunk API calls |

**Import script design:**

The script must be **resumable** — if a network error or API timeout interrupts a large import, it should pick up where it left off instead of requiring a full restart. Progress is checkpointed to a local JSON file after each successful API batch.

```typescript
// scripts/migrate-to-d1.ts
const BATCH_SIZE = 100; // rows per INSERT statement
const API_BATCH_SIZE = 50; // statements per D1 API call
const CHECKPOINT_FILE = "./migration-checkpoint.json";

type Checkpoint = Record<string, number>; // tableName → last successfully imported row index

function loadCheckpoint(): Checkpoint {
  try { return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8")); }
  catch { return {}; }
}

function saveCheckpoint(cp: Checkpoint) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

async function importTable(tableName: string, rows: Record<string, unknown>[], dryRun = false) {
  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint[tableName] ?? 0;

  if (startIndex >= rows.length) {
    console.log(`${tableName}: already fully imported (${rows.length} rows), skipping`);
    return;
  }
  if (startIndex > 0) {
    console.log(`${tableName}: resuming from row ${startIndex} / ${rows.length}`);
  }

  const remaining = rows.slice(startIndex);
  const chunks = chunkArray(remaining, BATCH_SIZE);
  let importedCount = startIndex;

  for (const apiBatch of chunkArray(chunks, API_BATCH_SIZE)) {
    const statements = apiBatch.map((chunk) => ({
      sql: buildBatchInsert(tableName, chunk),
      params: flattenParams(chunk),
    }));

    if (dryRun) {
      console.log(`[dry-run] ${tableName}: would import ${apiBatch.flat().length} rows`);
    } else {
      await d1HttpApi.batch(statements); // POST /client/v4/accounts/.../d1/database/.../query
      importedCount += apiBatch.flat().length;

      // Checkpoint after each successful API batch
      checkpoint[tableName] = importedCount;
      saveCheckpoint(checkpoint);
      console.log(`${tableName}: imported ${importedCount} / ${rows.length} rows`);
    }
  }
}
```

**CLI flags:**
- `--dry-run` — validates transforms and logs what would be imported without writing to D1
- `--reset` — deletes the checkpoint file to force a full re-import
- `--table <name>` — import a single table (useful for retrying one failed table)
```

**Import order** (respects foreign key constraints):
1. `households` → 2. `users` → 3. `groceryTags` → 4. `groceryItems` → 5. `groceryItemTags` → 6. `transactions` → 7. `budgets` → 8. `recurringTransactions` → 9. `debts` → 10. `assets` → 11. `exchangeRates` → 12. `auditLogs`

The script runs locally via `bun run scripts/migrate-to-d1.ts` using the D1 HTTP API with a Cloudflare API token. It is not a Worker — it runs outside the Workers runtime and is not subject to CPU time limits.

## 18. CI/CD Pipeline

### Current: GitHub Actions (Docker-centric)

The existing `.github/workflows/ci.yaml` builds Docker images for `apps/api` and `apps/web`, runs tests with a `DATABASE_URL` pointing to a Postgres service container, and handles Docker-based deployment.

### New: Wrangler-based CI/CD

Replace entirely with a Cloudflare-native pipeline:

```yaml
# .github/workflows/ci.yaml
name: CI/CD

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test
      # Tests use local D1 (SQLite in-memory) via miniflare/vitest

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: [lint-and-typecheck, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install && bun run build
      - name: Deploy preview with isolated bindings
        uses: cloudflare/wrangler-action@v3
        with:
          command: versions upload
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [lint-and-typecheck, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install && bun run build
      - uses: cloudflare/wrangler-action@v3
        with:
          command: deploy
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### What changes in CI

| Current | New |
|---------|-----|
| Docker matrix build (`apps/api`, `apps/web`) | Removed entirely |
| `DATABASE_URL` env var for tests | Not needed; tests use local D1 via miniflare |
| Docker image push | Replaced by `wrangler deploy` |
| Separate API/web deploy steps | Single `wrangler deploy` |

### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers/D1/KV permissions
- `CLERK_SECRET_KEY` — for test environment (if integration tests need auth)

### Preview Environment Isolation

**Problem:** Preview deployments (`wrangler versions upload`) share the same D1 database and KV namespace as production unless explicitly overridden. A preview build running migrations or writing test data would corrupt production.

**Solution: Use `wrangler.jsonc` environments for preview isolation.**

Add a `preview` environment in `wrangler.jsonc` with dedicated D1 and KV bindings:

```jsonc
// wrangler.jsonc (additions)
{
  // ... production bindings (default) ...

  "env": {
    "preview": {
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "amigo-db-preview",
          "database_id": "<created-via-wrangler>",
          "migrations_dir": "packages/db/migrations"
        }
      ],
      "kv_namespaces": [
        {
          "binding": "CACHE",
          "id": "<created-via-wrangler>"
        }
      ],
      "vars": {
        "APP_ENV": "preview",
        "CLERK_PUBLISHABLE_KEY": "pk_test_..."
      }
    }
  }
}
```

**Preview D1 + KV setup (one-time):**

```bash
# Create preview-specific resources
wrangler d1 create amigo-db-preview
wrangler kv namespace create CACHE --env preview

# Apply migrations to preview D1
wrangler d1 migrations apply amigo-db-preview --remote

# Seed preview with test data
wrangler d1 execute amigo-db-preview --remote --file=packages/db/seed.sql
```

**CI preview deployment uses the `--env preview` flag:**

```yaml
- name: Deploy preview
  uses: cloudflare/wrangler-action@v3
  with:
    command: versions upload --env preview
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Durable Objects** are automatically isolated per environment — the `preview` environment gets its own DO namespace, so WebSocket state is never shared with production.

**Trade-off:** This uses a single shared preview D1 database across all PRs rather than per-PR databases. For a small household app, this is sufficient. If per-PR isolation is needed later, a CI step could create/destroy temporary D1 databases per PR using `wrangler d1 create` / `wrangler d1 delete`, but the operational complexity isn't justified yet.

## 19. Environment Configuration

### Current `.env.example` (obsolete after migration)

Contains: `DATABASE_URL`, `VALKEY_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `APP_URL`, `DEV_APP_URL`, `CLOUDFLARE_API_TOKEN`, `VAPID_*` keys, `TZ`.

### New: `.dev.vars` (Cloudflare Workers local dev)

```env
# Clerk
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

All other configuration lives in `wrangler.jsonc`:
- D1 database binding (`DB`)
- KV namespace binding (`CACHE`)
- Durable Object binding (`HOUSEHOLD`)
- `vars` for non-secret config (`APP_ENV`, `CLERK_PUBLISHABLE_KEY`)

Production secrets are set via `wrangler secret put <KEY>`.

### New `.env.example`

```env
# Local development secrets (copy to .dev.vars)
# See wrangler.jsonc for non-secret configuration

CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

## 20. Local Developer Experience (DX)

### Current: Docker-based one-click environment

`make dev-local` starts PostgreSQL + Valkey in Docker, runs Next.js locally. `make dev-up` starts everything in containers. Developers get a fully working environment with one command.

### New: Vite + Wrangler local runtime

The `@cloudflare/vite-plugin` provides a local Workers runtime (Miniflare) with full D1, KV, and Durable Object bindings — no Docker required. However, this needs explicit orchestration to match the previous one-command DX.

**Bootstrap script (`package.json`):**

```json
{
  "scripts": {
    "dev": "vite dev",
    "dev:setup": "bun run db:migrate:local && bun run db:seed:local",
    "dev:reset": "rm -rf .wrangler/state && bun run dev:setup",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply amigo-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply amigo-db --remote",
    "db:seed:local": "wrangler d1 execute amigo-db --local --file=packages/db/seed.sql",
    "db:studio": "drizzle-kit studio",
    "build": "vite build",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**First-time setup:**

```bash
# 1. Install dependencies
bun install

# 2. Copy secrets template
cp .env.example .dev.vars
# Edit .dev.vars with Clerk test keys

# 3. Set up local database (creates .wrangler/state/v3/d1/ SQLite file)
bun run dev:setup

# 4. Start development server (Workers runtime + Vite HMR)
bun run dev
```

**How local bindings work:**

| Binding | Local Behavior | Storage Location |
|---------|---------------|-----------------|
| D1 (`DB`) | SQLite file via Miniflare | `.wrangler/state/v3/d1/` |
| KV (`CACHE`) | In-memory KV via Miniflare | `.wrangler/state/v3/kv/` |
| Durable Objects (`HOUSEHOLD`) | Local DO runtime via Miniflare | `.wrangler/state/v3/do/` |
| Secrets (`.dev.vars`) | Loaded automatically by Vite plugin | `.dev.vars` file |

**Key DX guarantees:**

- `bun run dev` is the only command needed after initial setup — Vite + Cloudflare plugin handles everything
- `bun run dev:reset` wipes all local state and re-seeds — equivalent to a fresh Docker environment
- `bun run dev:setup` is idempotent (migrations skip already-applied, seed uses `INSERT OR IGNORE`)
- Local D1 persists across `vite dev` restarts (no data loss on HMR or server restart)
- All bindings (D1, KV, DO) work identically to production — no mocks or stubs

**`.gitignore` additions:**

```
.wrangler/
.dev.vars
```

## 21. Database Seeding

### Current: `packages/db/src/seed.ts`

Uses the `postgres` driver to seed development data via `DATABASE_URL`.

### New: D1-compatible seed script

Rewrite `seed.ts` to use the D1 HTTP driver for remote seeding or `better-sqlite3` for local:

```bash
# Seed local D1 (during development)
wrangler d1 execute amigo-db --local --file=packages/db/seed.sql

# Or via a TypeScript seed script using D1 HTTP API
bun run seed
```

The seed script will:
- Use `drizzle-orm/d1` with the D1 HTTP driver config from `drizzle.config.ts`
- Generate the same test data (sample household, users, grocery items, transactions)
- Adapt all values to SQLite types (integer cents, Unix ms timestamps, text UUIDs)

## 22. PWA Assets Migration

### Current: `apps/web/public/`

Contains `manifest.json`, `sw.js` (Serwist-generated), and PWA icons (various sizes).

### New: `public/` at project root

- Move all PWA icons from `apps/web/public/` to `public/`
- **`manifest.json`**: Move and update (same content, new paths if needed)
- **`sw.js`**: Remove entirely. The service worker will be generated by `vite-plugin-pwa` based on its config in `vite.config.ts`. The plugin handles precache manifests, runtime caching strategies, and SW registration automatically.
- **Static assets**: Any other static files (favicon, robots.txt, etc.) move to `public/`

### vite-plugin-pwa config

```typescript
// vite.config.ts
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // ... other plugins
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "amigo",
        short_name: "amigo",
        // ... icon definitions
      },
      workbox: {
        runtimeCaching: [
          { urlPattern: /^\/api\//, handler: "NetworkFirst" },
          { urlPattern: /\.(?:js|css|png|jpg|svg)$/, handler: "CacheFirst" },
        ],
      },
    }),
  ],
});
```

## 23. Documentation Updates

After migration is complete, update all project documentation:

| File | Action |
|------|--------|
| `docs/ARCHITECTURE.md` | Rewrite to reflect Cloudflare-native stack (Worker, D1, KV, DO) |
| `docs/CHANGELOG.md` | Add migration entry |
| `CLAUDE.md` | Update tech stack, commands, project structure, patterns |
| `README.md` (if exists) | Update setup instructions, remove Docker references |
| `.env.example` | Replace with `.dev.vars` template (see section 19) |

These updates are included as explicit tasks in Phase 5.

## 24. Implementation Phases

### Phase 1: Foundation
- Set up project scaffolding (Vite + React Router v7 framework mode + Cloudflare)
- Create `wrangler.jsonc` with D1, KV, DO bindings (incl. `preview` environment — section 18)
- Create `.dev.vars` with Clerk secrets
- Set up local dev bootstrap scripts (`dev:setup`, `dev:reset` — section 20)
- Convert all Drizzle schemas from `pg-core` to `sqlite-core`
- Generate and apply D1 migrations
- Write D1-compatible seed script
- Set up Clerk integration (middleware + `<ClerkProvider>`)
- Basic auth flow working (sign in → create user/household → dashboard)

### Phase 2: Core Features
- Port all server actions to React Router loaders/actions and resource routes
- Port all React Router routes (dashboard, groceries, budget, transactions)
- Port components (adapt from Next.js patterns to RR7 patterns)
- Wire up loaders for SSR data fetching
- KV-backed rate limiting
- Application-level RLS (query scoping via `scopeToHousehold`)
- Application-level audit logging (via `withAudit`)

### Phase 3: Real-time & Offline
- Implement HouseholdDO (Durable Object with WebSocket Hibernation)
- Port `useWebSocket` hook to connect to DO
- Wire server actions to broadcast via DO
- Port Dexie offline sync with chunked batch API (max 10 mutations per request — section 10)
- Implement `/api/sync` batch endpoint with single broadcast per batch
- Migrate PWA assets from `apps/web/public/` to `public/`
- Service worker setup (`vite-plugin-pwa`)

### Phase 4: Remaining Features
- Recurring transactions
- Debts & assets
- Calendar
- Settings & household management
- Account recovery (restore / fresh start)
- Exchange rates (Cache API + D1 — section 8)
- Charts (Recharts)
- Cron Trigger for audit log retention

### Phase 5: Polish & Deploy
- Error handling audit
- Rate limiting on all actions
- Audit logging on all mutations
- RBAC checks on all protected actions
- Data migration script with batched imports (PostgreSQL → D1 — section 17)
- Create preview D1 database + KV namespace (section 18)
- Rewrite CI/CD pipeline (`.github/workflows/ci.yaml`) with preview isolation
- Replace `.env.example` with Cloudflare-native version
- Update documentation (`docs/ARCHITECTURE.md`, `CLAUDE.md`, `docs/CHANGELOG.md`)
- Remove obsolete files (Docker, scripts, Turborepo config, Authentik code)
- Production deployment via `wrangler deploy`
- DNS cutover
