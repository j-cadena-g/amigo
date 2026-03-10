# amigo - Architecture Specification

**Project:** Household Budgeting Application with Grocery Tracking
**Deployment:** Cloudflare Workers
**Date:** March 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Data Architecture](#data-architecture)
5. [Core Features & UX Patterns](#core-features--ux-patterns)
6. [Server Architecture](#server-architecture)
7. [Real-time Architecture](#real-time-architecture)
8. [Authentication (Clerk)](#authentication-clerk)
9. [Security](#security)
10. [Offline & PWA](#offline--pwa)
11. [Deployment & CI/CD](#deployment--cicd)

---

## Project Overview

A household management platform deployed on Cloudflare Workers. Manages budgeting, grocery lists, assets, debts, and recurring transactions with real-time sync and offline support.

### Key Design Decisions

* **Single Worker:** Hono server + React Router v7 SSR in one Cloudflare Worker
* **Integer Cents:** All money stored as integer cents in D1 (no floats)
* **Application-Level RLS:** `scopeToHousehold()` filter on every query (no database-level policies)
* **Optimistic Groceries:** Zero-latency UI updates with background sync via Dexie (IndexedDB)

---

## Tech Stack

### Runtime & Language

* **Cloudflare Workers:** V8 isolates
* **TypeScript 5.7+:** Strict mode, no `any` types

### Frontend

* **React Router v7:** Framework mode with SSR loaders
* **React 19:** `useOptimistic` for instant feedback
* **Tailwind CSS 4:** Utility-first styling
* **Shadcn/UI:** Component primitives (Radix-based)
* **Recharts:** Budget charts (pie, bar)

### Server

* **Hono:** HTTP framework, API routes, middleware
* **hono-react-router-adapter:** Bridges Hono and React Router v7 SSR
* **Zod v4:** Runtime validation

### Data Layer

* **Cloudflare D1:** SQLite database
* **Drizzle ORM:** Type-safe queries with `drizzle-orm/d1`
* **Cloudflare KV:** Session cache, rate limiting
* **Durable Objects:** WebSocket hub (Hibernation API)

### Auth

* **Clerk:** Authentication provider
* **@hono/clerk-auth:** Hono middleware
* **@clerk/react-router:** React Router integration

---

## Project Structure

```text
amigo/
├── app/                          # React Router v7 frontend
│   ├── components/               # UI components
│   │   ├── groceries/            # Grocery list (offline-capable)
│   │   ├── layout/               # Nav bar, app shell
│   │   ├── settings/             # Household settings components
│   │   └── ui/                   # Shadcn/UI primitives
│   ├── lib/                      # Client utilities
│   │   ├── offline/              # Dexie DB, sync queue, conflict resolution
│   │   ├── currency.ts           # formatCents(), cents-based formatting
│   │   ├── session.server.ts     # requireSession(), getEnv() for loaders
│   │   ├── utils.ts              # cn() class merge helper
│   │   └── websocket.ts          # useWebSocket hook
│   ├── routes/                   # Route modules with loaders
│   │   ├── _app.tsx              # Authenticated layout (Clerk gate)
│   │   ├── dashboard.tsx         # Monthly summary
│   │   ├── groceries.tsx         # Grocery list
│   │   ├── budget.tsx            # Budget layout (tabs)
│   │   ├── budget.transactions.tsx
│   │   ├── budget.budgets.tsx
│   │   ├── budget.recurring.tsx
│   │   ├── assets.tsx
│   │   ├── debts.tsx
│   │   ├── calendar.tsx
│   │   ├── settings.tsx
│   │   └── restore-account.tsx
│   ├── routes.ts                 # Route config
│   ├── root.tsx                  # Root layout
│   └── app.css                   # Tailwind theme
│
├── server/                       # Hono backend
│   ├── api/                      # API route groups
│   │   ├── groceries.ts          # CRUD, toggle, tags, purchase-date
│   │   ├── tags.ts               # Grocery tag CRUD
│   │   ├── transactions.ts       # Add, update, soft-delete
│   │   ├── budgets.ts            # CRUD + spending query
│   │   ├── recurring.ts          # CRUD, toggle, process-due
│   │   ├── assets.ts             # CRUD
│   │   ├── debts.ts              # CRUD (loan/credit card)
│   │   ├── members.ts            # List, role, transfer, remove
│   │   ├── settings.ts           # Household name
│   │   ├── calendar.ts           # Month events aggregation
│   │   ├── restore.ts            # Account restore/fresh-start
│   │   ├── audit.ts              # Record history
│   │   ├── sync.ts               # Offline batch sync (max 10/request)
│   │   └── health.ts             # Health check
│   ├── durable-objects/
│   │   └── household.ts          # WebSocket hub (HouseholdDO)
│   ├── middleware/
│   │   ├── auth.ts               # resolveAppSession, resolveAppSessionSoft
│   │   └── rate-limit.ts         # KV-backed rate limiting
│   ├── lib/
│   │   ├── session.ts            # resolveSession() shared logic
│   │   ├── errors.ts             # ActionError, logServerError
│   │   ├── permissions.ts        # RBAC helpers
│   │   ├── conversions.ts        # toCents(), toISODate()
│   │   ├── exchange-rates.ts     # 3-tier cache (Cache API → D1 → external)
│   │   └── realtime.ts           # broadcastToHousehold()
│   ├── env.ts                    # HonoEnv type definition
│   └── index.ts                  # Hono app entrypoint
│
├── packages/
│   ├── db/                       # Drizzle ORM (D1/SQLite)
│   │   ├── src/
│   │   │   ├── schema/           # 13 table definitions (sqlite-core)
│   │   │   └── index.ts          # getDb(d1), scopeToHousehold(), exports
│   │   ├── migrations/           # D1 SQL migrations
│   │   └── drizzle.config.ts
│
├── public/                       # Static assets (PWA icons, manifest)
├── worker.ts                     # Worker entrypoint (fetch + scheduled)
├── load-context.ts               # React Router AppLoadContext type augmentation
├── wrangler.jsonc                # Cloudflare bindings config
├── vite.config.ts                # Vite + React Router + Hono adapter
├── react-router.config.ts        # React Router framework config
└── scripts/
    └── migrate-to-d1.ts          # PG → D1 data migration (one-time)
```

---

## Data Architecture

### D1 Schema Conventions

All schemas use `drizzle-orm/sqlite-core`:

| PostgreSQL | D1 (SQLite) |
|------------|-------------|
| `uuid().defaultRandom()` | `text().$defaultFn(() => crypto.randomUUID())` |
| `timestamp({ withTimezone: true })` | `integer({ mode: "timestamp_ms" })` |
| `numeric(precision, scale)` (money) | `integer` (cents) |
| `numeric` (rates) | `real` |
| `boolean` | `integer({ mode: "boolean" })` |
| `jsonb` | `text({ mode: "json" })` |
| `date` | `text` (ISO 8601 YYYY-MM-DD) |
| `pgEnum` | `text({ enum: [...] })` with exported const arrays |

### Key Tables

All tables include `createdAt`, `updatedAt` (integer ms). Sync-enabled tables include `deletedAt` for soft deletes.

* **households**: id, name, homeCurrency
* **users**: id, clerkId (unique), householdId (FK), role, name, email
* **transactions**: id, amount (cents), category, date, type, budgetId, currency
* **groceryItems**: id, itemName, isPurchased, category, quantity, unit
* **budgets**: id, name, limitAmount (cents), period, currency, userId (null = shared)
* **recurringTransactions**: id, description, amount (cents), frequency, nextOccurrence
* **assets**: id, name, currentValue (cents), currency
* **debts**: id, name, type (LOAN/CREDIT_CARD), currentBalance (cents), currency
* **auditLogs**: id, tableName, recordId, action, oldData, newData

### Row-Level Security

Application-level via `scopeToHousehold()`:

```typescript
import { scopeToHousehold } from "@amigo/db";

// Every query MUST include this filter
const items = await db.query.groceryItems.findMany({
  where: and(
    scopeToHousehold(groceryItems.householdId, session.householdId),
    isNull(groceryItems.deletedAt)
  ),
});
```

---

## Server Architecture

### Request Flow

```
Client → Cloudflare Worker
  → Hono middleware (Clerk auth, rate limiting)
    → /api/* → resolveAppSession (strict, 401 if unauthed)
    → /* → resolveAppSessionSoft (sets session if available)
      → React Router SSR (loaders access session via context)
```

### Loader Pattern

Loaders access Hono context via the adapter:

```typescript
export async function loader({ context }: LoaderFunctionArgs) {
  const session = requireSession(context);  // redirects to / if unauthed
  const env = getEnv(context);              // Cloudflare bindings
  const db = getDb(env.DB);                 // D1 database

  const items = await db.query.transactions.findMany({
    where: and(
      scopeToHousehold(transactions.householdId, session.householdId),
      isNull(transactions.deletedAt)
    ),
  });

  return { items };
}
```

### Mutation Pattern

Client-side fetch to Hono API endpoints:

```typescript
const res = await fetch("/api/transactions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: Math.round(parseFloat(input) * 100), ... }),
});
if (res.ok) revalidator.revalidate();
```

---

## Real-time Architecture

### Durable Objects WebSocket Hub

Each household gets a Durable Object instance (`HouseholdDO`) that manages WebSocket connections using the Hibernation API.

1. Client connects to `/ws` → routed to HouseholdDO
2. Server mutations call `broadcastToHousehold(env, householdId, message, senderId?)`
3. Connected clients receive message → trigger `revalidator.revalidate()`
4. Sender filtering: optional `senderId` skips the mutation author's connection

---

## Authentication (Clerk)

* **Provider:** Clerk (SaaS)
* **Server:** `@hono/clerk-auth` middleware verifies JWT
* **Client:** `@clerk/react-router` provides `<ClerkProvider>`, sign-in/up components
* **Session cache:** KV with 24h TTL, keyed by `clerk_user_id`
* **First login:** Auto-creates household + user record in D1

---

## Security

### Rate Limiting (KV-backed)

| Preset | Limit | Use Case |
|--------|-------|----------|
| MUTATION | 30/min | Standard add/update/delete |
| BULK | 10/min | Bulk operations |
| SENSITIVE | 10/min | Settings, member management |
| READ | 60/min | List operations |

### RBAC

Roles: `owner` > `admin` > `member`

* `canManageHousehold()` — owner/admin
* `canManageMembers()` — owner/admin
* `canTransferOwnership()` — owner only

---

## Offline & PWA

### Grocery List (Offline-Capable)

* **Dexie (IndexedDB):** Local grocery items, tags, sync queue
* **Sync processor:** Chunked batch sync (max 10 mutations per API call)
* **Conflict resolution:** Server-wins with field-level merge
* **Service Worker:** `vite-plugin-pwa` with NetworkFirst (API) and CacheFirst (static)

---

## Deployment & CI/CD

### Local Development

```bash
bun install
bun run dev:setup    # Apply D1 migrations + seed
bun run dev          # Vite dev server with Workers runtime
```

### Production

```bash
bun run build        # Vite build
wrangler deploy      # Deploy to Cloudflare Workers
```

### Database Migrations

```bash
bun run db:generate              # Generate migration from schema changes
bun run db:migrate:local         # Apply to local D1
bun run db:migrate:remote        # Apply to production D1
```

### CI/CD (GitHub Actions)

* **Push/PR:** Lint → Typecheck → Test
* **PR:** Deploy preview (isolated D1 + KV via `--env preview`)
* **Main:** Deploy production via `wrangler deploy`

### Required Secrets

* `CLOUDFLARE_API_TOKEN` — Workers/D1/KV permissions
* `CLERK_SECRET_KEY` — Set via `wrangler secret put`
