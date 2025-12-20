# amigo - Architecture Specification

**Project:** Household Budgeting Application with Grocery Tracking
**Domain:** `cadenalabs.net`
**Deployment:** Self-hosted on Proxmox (Docker + Tailscale)
**Date:** December 2025

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack and Standards](#tech-stack-and-standards)
3. [Project Structure](#project-structure)
4. [Data Architecture](#data-architecture)
5. [Core Features and UX Patterns](#core-features-and-ux-patterns)
6. [Hybrid Data Access Strategy](#hybrid-data-access-strategy)
7. [Real-time Architecture](#real-time-architecture)
8. [Authentication and Security](#authentication-and-security)
9. [Infrastructure and Networking](#infrastructure-and-networking)
10. [Implementation Phases](#implementation-phases)

---

## Project Overview

A high-performance, self-hosted household management platform for `cadenalabs.net`. The system prioritizes **Type Safety** (End-to-End), **Local-First UX** (Optimistic UI), and **Data Ownership**.

### Key Differentiators

* **Monorepo Efficiency:** Server Components read directly from the database; Client Components fetch via typed RPC.
* **Optimistic Groceries:** Zero-latency UI updates using React 19's `useOptimistic`, with background synchronization.
* **Private SSL:** Uses Cloudflare DNS-01 challenges to provision valid HTTPS certificates for internal Tailscale IPs.

---

## Tech Stack and Standards

### Runtime and Language

* **Bun:** (Latest) Primary runtime for local dev, scripting, and CI.
* **TypeScript 5.7+:** Strict mode enabled. **Rule:** No `any` types permitted.

### Frontend (The "App")

* **Next.js 15+ (App Router):** `output: "standalone"` for optimized container builds.
* **React 19:** Leveraging `useActionState` for mutations and `useOptimistic` for instant feedback.
* **Tailwind CSS 4.0:** Utility-first styling.
* **Shadcn/UI:** Component primitive library.
* **Nuqs:** Type-safe search params state management.

### Backend Services

* **Hono (The "Realtime Server"):** Handles WebSockets, Delta Sync, and external Webhooks.
* **Next.js Server Actions:** Handles Form Submissions and Mutations.
* **Zod:** Runtime validation (Single Source of Truth).

### Data Layer

* **PostgreSQL 17:** Primary database.
* **Drizzle ORM:** TypeScript ORM.
* **Drizzle-Zod:** Automatic Zod schema generation from DB schema.
* **Valkey 8:** High-performance key/value store (Redis fork) for Sessions and Pub/Sub.

### Infrastructure

* **Docker Compose:** Container orchestration.
* **Caddy:** Reverse proxy with automatic DNS-01 SSL via Cloudflare.
* **Tailscale:** Zero Trust Network Access (ZTNA).

---

## Project Structure

```text
amigo/
├── apps/
│   ├── web/                      # Next.js 15 App Router
│   │   ├── src/
│   │   │   ├── app/             # Routes (Server Components)
│   │   │   ├── actions/         # Server Actions (Direct DB Access)
│   │   │   ├── components/      # Client Components
│   │   │   └── lib/             # Hono RPC Client (for Client Components)
│   │
│   └── api/                      # Hono Server (WebSockets/Sync)
│       ├── src/
│       │   ├── routes/          # RPC Route Definitions (Sync/Health)
│       │   ├── ws/              # WebSocket Handlers
│       │   └── index.ts         # Exports AppType for RPC
│
├── packages/
│   ├── db/                       # Drizzle ORM Source of Truth
│   │   ├── src/
│   │   │   ├── schema/          # Table Definitions
│   │   │   └── index.ts         # DB Connection and Typed Exports
│   │
│   ├── types/                    # Shared Types and Zod Schemas
│   │
│   └── ui/                       # Shared Shadcn Components
│
├── docker/
├── docker-compose.prod.yaml      # Production orchestration
└── turbo.json                    # Monorepo Config
```

---

## Data Architecture

### Single Source of Truth

We utilize **Drizzle-Zod** to prevent schema drift.

1. **Define Table:** `packages/db/src/schema/groceries.ts`
2. **Generate Zod:** `createInsertSchema(groceryTable)`
3. **Infer Type:** `z.infer<typeof insertGrocerySchema>`

### Database Schema (Critical Tables)

All tables include `created_at`, `updated_at`. Sync-enabled tables include `deleted_at`.

* **`households`**: `id`, `name`.
* **`users`**: `id`, `auth_id` (Unique), `household_id` (FK).
* **`transactions`**: `id`, `amount`, `category`, `date`, `type` (income/expense), `deleted_at`.
* **`grocery_items`**: `id`, `item_name`, `is_purchased` (bool), `category`, `deleted_at`.

### Database Connection (Pooling)

Configured in `packages/db`.

* **Dev:** Max 5 connections.
* **Prod:** Max 20 connections.
* **Driver:** `postgres` (porsager/postgres) for built-in pooling.

---

## Hybrid Data Access Strategy

To maximize performance in a monorepo, we use different access patterns for Server vs. Client.

### 1. Read: Server Components (RSC) -> Direct DB

**Pattern:** Next.js Server Components import `db` from `packages/db` and query directly.
**Why:** Lowest latency, no serialization overhead, no HTTP round-trip.

```typescript
// apps/web/src/app/dashboard/page.tsx
import { db } from '@amigo/db';
import { transactions } from '@amigo/db/schema';

export default async function Dashboard() {
  const data = await db.select().from(transactions).limit(10);
  return <TransactionList initialData={data} />;
}
```

### 2. Read: Client Components -> Hono RPC

**Pattern:** Client-side interactions (Infinite Scroll, Polling) use Hono RPC.
**Why:** Type-safe fetching without exposing direct DB logic to the browser.

```typescript
// apps/web/src/components/TransactionList.tsx
import { client } from '@/lib/api';

const fetchMore = async () => {
  const res = await client.api.transactions.$get({ query: { page: 2 } });
  const data = await res.json();
};
```

### 3. Write: Server Actions -> Direct DB + Valkey

**Pattern:** Mutations happen via Next.js Server Actions.

1. Validate input (Zod).
2. Write to DB (Direct).
3. Publish "Update" event to Valkey (for Hono to broadcast).
4. Revalidate Next.js Cache (`revalidatePath`).

```typescript
// apps/web/src/actions/groceries.ts
'use server'
import { db } from '@amigo/db';
import { redis } from '@/lib/redis';

export async function toggleItem(id: string) {
  await db.update(groceryItems)...;
  await redis.publish('household:updates', JSON.stringify({ type: 'GROCERY_UPDATE' }));
  revalidatePath('/groceries');
}
```

---

## Core Features and UX Patterns

### 1. The Grocery Module (Optimistic UI)

* **Requirement:** 0ms latency.
* **Implementation:**
  * **UI:** React `useOptimistic` toggles the checkbox instantly.
  * **Network:** Triggers Server Action in background.
  * **Sync:** If successful, Server Action publishes to Valkey. Hono (WebSocket server) receives message and broadcasts to *other* clients.

---

## Real-time Architecture

We separate **State** (DB) from **Signal** (WebSockets) using Valkey and WebSockets.

1. **Event:** User A mutates data via Server Action.
2. **Pub:** Server Action publishes to Valkey channel `household:{id}`.
3. **Sub:** `apps/api` (Hono) subscribes to Valkey.
4. **Broadcast:** Hono pushes message via WebSocket to connected clients.

---

## Authentication and Security

### OIDC Flow (Authelia)

* **Provider:** Self-hosted Authelia (running in a separate LXC container on Proxmox).
* **Mechanism:** Authorization Code Flow with PKCE.
* **Session:** Stored in Valkey.
* **Cookie:** `amigo_session` (HttpOnly, Secure, SameSite=Lax).
* **Scope:** `.cadenalabs.net` (Covers both `amigo.` and `dev-amigo.`).

### OIDC Configuration

Environment variables for Authelia integration:

* `AUTHELIA_ISSUER` - The Authelia OIDC issuer URL (e.g., `https://auth.cadenalabs.net`).
* `AUTHELIA_CLIENT_ID` - The OIDC client ID registered in Authelia.
* `AUTHELIA_CLIENT_SECRET` - The OIDC client secret.

### User Identity

The `auth_id` field in the `users` table stores the OIDC provider's `sub` claim, providing a generic identifier that works with any OIDC-compliant provider.

### Row-Level Security (RLS)

Security is enforced at the Database level using Postgres RLS.

* **Middleware:** Sets `app.current_household_id` config var on every DB transaction.
* **Policy:** `CREATE POLICY tenant_isolation ON tables USING (household_id = current_setting('app.current_household_id')::uuid);`

---

## Infrastructure and Networking

### Environment Isolation

Single VM (Proxmox) hosting both Dev and Prod stacks, separated by Docker Networks.

* **Prod Domain:** `amigo.cadenalabs.net`
* **Dev Domain:** `dev-amigo.cadenalabs.net`

### SSL Strategy (Cloudflare DNS-01)

Since the server is behind Tailscale (no public IP), we use **Caddy** with the Cloudflare module to provision valid certificates.

**Caddyfile:**

```text
{
  email your-email@cadenalabs.net
}

amigo.cadenalabs.net, dev-amigo.cadenalabs.net {
  tls {
    dns cloudflare {env.CLOUDFLARE_API_TOKEN}
  }

  @dev host dev-amigo.cadenalabs.net
  handle @dev {
    reverse_proxy web-dev:3000
  }

  @prod host amigo.cadenalabs.net
  handle @prod {
    reverse_proxy web-prod:3000
  }
}
```

### Docker Build Optimization

Next.js builds can be memory intensive.

* **Dockerfile:** Use `output: "standalone"` in `next.config.js`.
* **Runner:** Use a swap file on the VM if RAM is < 4GB.

---

## Implementation Phases

### Phase 1: Monorepo Skeleton

1. Init Turborepo.
2. Setup `packages/db` with Drizzle and `packages/types`.
3. Verify local `bun db:migrate`.

### Phase 2: Hybrid Core

1. Create `apps/web` (Next.js) and `apps/api` (Hono).
2. Implement **Direct DB Access** in a Next.js Page.
3. Implement **Hono RPC** in a Client Component.

### Phase 3: Auth and Identity

1. Setup Authelia OIDC for `cadenalabs.net`.
2. Create Auth Middleware (validating Valkey sessions).
3. Ensure Cookie sharing between `dev-amigo` and `amigo`.

### Phase 4: Real-time Groceries

1. Build `grocery_items` schema.
2. Implement **Server Action** for `addItem` (Write).
3. Implement **WebSocket** in Hono (Broadcast).
4. Wire up `useOptimistic` in Frontend.

### Phase 5: Budgeting

1. Create `transactions` schema.
2. Build Dashboard with Recharts.
3. Implement Infinite Scroll using Hono RPC.

---

## Notes for Claude Code

### Critical Directives

1. **Monorepo Patterns:**
   * Next.js Server Components -> Import `@amigo/db` directly.
   * Next.js Client Components -> Use `@amigo/api` RPC client.
   * Next.js Server Actions -> Import `@amigo/db` directly + Publish to Valkey.

2. **No "Any" Types:** Ask for clarification if types are difficult.
3. **Schema First:** Changes start in `packages/db/schema`, then generate migrations, then update code.
4. **Domain Awareness:** All links, auth callbacks, and cookies must respect `*.cadenalabs.net`.
