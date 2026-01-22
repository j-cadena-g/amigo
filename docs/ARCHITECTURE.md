# amigo - Architecture Specification

**Project:** Household Budgeting Application with Grocery Tracking
**Domain:** `cadenalabs.net`
**Deployment:** Self-hosted on Proxmox (Docker + Tailscale)
**Date:** December 2025

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack & Standards](#tech-stack--standards)
3. [Project Structure](#project-structure)
4. [Data Architecture](#data-architecture)
5. [Core Features & UX Patterns](#core-features--ux-patterns)
6. [Hybrid Data Access Strategy](#hybrid-data-access-strategy)
7. [Real-time Architecture](#real-time-architecture)
8. [Authentication (Authentik)](#authentication-authentik)
9. [Infrastructure & Networking](#infrastructure--networking)
10. [Security & RLS](#security--rls)
11. [Error Handling](#error-handling)
12. [Testing Strategy](#testing-strategy)
13. [Logging & Observability](#logging--observability)
14. [Audit Logging](#audit-logging)
15. [Backup & Data Recovery](#backup--data-recovery)
16. [CI/CD Pipeline](#cicd-pipeline)
17. [Implementation Phases](#implementation-phases)

---

## Project Overview

A high-performance, self-hosted household management platform for `cadenalabs.net`. The system prioritizes **Type Safety** (End-to-End), **Local-First UX** (Optimistic UI), and **Data Ownership**.

### Key Differentiators

* **Monorepo Efficiency:** Server Components read directly from the database; Client Components fetch via typed RPC.
* **Optimistic Groceries:** Zero-latency UI updates using React 19’s `useOptimistic`, with background synchronization.
* **Private SSL:** Uses Cloudflare DNS-01 challenges to provision valid HTTPS certificates for internal Tailscale IPs.

---

## Tech Stack & Standards

### Runtime & Language

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
* **Caddy:** Reverse proxy (Replaces Nginx for automatic DNS-01 SSL).
* **Authentik:** OIDC Identity Provider (Docker, shares Postgres/Valkey).
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
│       │   ├── routes/          # RPC Route Definitions
│       │   ├── ws/              # WebSocket Handlers
│       │   └── index.ts         # Exports AppType for RPC
│
├── packages/
│   ├── db/                       # Drizzle ORM Source of Truth
│   │   ├── src/
│   │   │   ├── schema/          # Table Definitions
│   │   │   └── index.ts         # DB Connection
│   │
│   ├── types/                    # Shared Types & Zod Schemas
│   │
│   └── ui/                       # Shared Shadcn Components
│
├── docker/
├── docker-compose.prod.yaml      # Production orchestration
└── turbo.json                   # Monorepo Config

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
* **`users`**: `id`, `auth_id` (String, Unique, stores OIDC `sub`), `household_id` (FK).
* **`transactions`**: `id`, `amount`, `category`, `date`, `type`, `deleted_at`.
* **`grocery_items`**: `id`, `item_name`, `is_purchased` (bool), `category`, `deleted_at`.

---

## Hybrid Data Access Strategy

### 1. Read: Server Components (RSC) -> Direct DB

**Pattern:** Next.js Server Components import `db` from `packages/db` and query directly.
**Why:** Lowest latency, no serialization overhead.

### 2. Read: Client Components -> Hono RPC

**Pattern:** Client-side interactions (Infinite Scroll) use Hono RPC.
**Why:** Type-safe fetching without exposing direct DB logic to browser.

### 3. Write: Server Actions -> Direct DB + Valkey

**Pattern:** Mutations happen via Next.js Server Actions.

1. Validate input (Zod).
2. Write to DB (Direct).
3. Publish "Update" event to Valkey (for Hono to broadcast).
4. Revalidate Next.js Cache (`revalidatePath`).

---

## Real-time Architecture

We separate **State** (DB) from **Signal** (WebSockets).

1. **Event:** User A mutates data via Server Action.
2. **Pub:** Server Action publishes to Valkey channel `household:{id}`.
3. **Sub:** `apps/api` (Hono) subscribes to Valkey.
4. **Broadcast:** Hono pushes message via WebSocket to connected clients.

---

## Authentication (Authentik)

### OIDC Flow

* **Provider:** Authentik (Docker containers: `authentik-server` + `authentik-worker`).
* **Issuer URL:** `https://auth.cadenalabs.net/application/o/amigo/`
* **Mechanism:** Authorization Code Flow with PKCE.
* **Scope:** `.cadenalabs.net` (Allows SSO across `amigo` and `dev-amigo`).

### Session Management

* **Cookie:** `amigo_session` (HttpOnly, Secure, SameSite=Lax, Domain=`.cadenalabs.net`).
* **Storage:** OIDC Profile stored in Valkey with session ID as key.

### Authorization

* **Middleware:** Validates session cookie against Valkey-stored profile.
* **User Mapping:** OIDC `sub` claim stored in `users.auth_id`.

### Bootstrap (First Deploy)

* Set `AUTHENTIK_BOOTSTRAP_PASSWORD` and `AUTHENTIK_BOOTSTRAP_EMAIL` on the **worker** container.
* Access `https://auth.cadenalabs.net` and login as `akadmin` with bootstrap password.
* Create OIDC application with redirect URIs for both prod and dev.

---

## Infrastructure & Networking

### Environment Isolation

Single VM (Proxmox) hosting both Dev and Prod stacks.

* **Prod:** `amigo.cadenalabs.net` (Port 3100)
* **Dev:** `dev-amigo.cadenalabs.net` (Port 3000)

### SSL Strategy (Caddy + Cloudflare)

```text
{
  email your-email@cadenalabs.net
}
amigo.cadenalabs.net, dev-amigo.cadenalabs.net {
  tls {
    dns cloudflare {env.CLOUDFLARE_API_TOKEN}
  }
  @dev host dev-amigo.cadenalabs.net
  handle @dev { reverse_proxy web-dev:3000 }
  @prod host amigo.cadenalabs.net
  handle @prod { reverse_proxy web-prod:3000 }
}

```

---

## Security & RLS

### Row-Level Security (RLS)

Security enforced at Database level.

* **Policy:** `CREATE POLICY tenant_isolation ON tables USING (household_id = current_setting('app.current_household_id')::uuid);`

### Content Security Policy (CSP)

* **Nonce-based:** Generated in Middleware, injected into Next.js and Tailwind.
* **Strict:** `script-src 'self' 'nonce-xyz'`.

### Rate Limiting

* **API Server:** Redis-backed rate limiting with in-memory fallback when Redis unavailable.
* **Server Actions:** Rate limiting middleware using shared Redis infrastructure.
* **Pattern:** Fail-closed with graceful degradation to in-memory limits.

### Input Validation

* **Standard:** All server action inputs validated with Zod schemas from `@amigo/types`.
* **Length Constraints:** String fields have `.max()` constraints matching database column sizes.
* **Category Constants:** Shared constants in `@amigo/types` prevent hardcoded defaults.

### Error Handling

* **Production:** Generic error messages returned to clients; detailed errors logged server-side.
* **Structured Logging:** JSON format with `level`, `event`, `timestamp` fields.
* **Security Events:** Sensitive operations (account restore, fresh start) logged via `logSecurityEvent()`.

### WebSocket Security

* **Session Validation:** Periodic revalidation of WebSocket connections via Redis pub/sub.
* **Heartbeat:** 30-second interval ensures stale connections are detected.
* **Logout Propagation:** Session invalidation events broadcast to terminate WebSocket connections.

### Session Cookie Security

* **Attributes:** `HttpOnly`, `Secure`, `SameSite=Lax`.
* **Domain:** `.cadenalabs.net` (shared across subdomains for SSO).
* **TTL:** 7-day expiration with refresh on access.
* **Note:** Parent domain scoping enables SSO but requires all subdomains to be trusted.

---

## Testing Strategy

### Test Pyramid

* **Unit (Bun Test):** Pure functions, Zod schemas, Utilities.
* **Integration (Bun Test):** API Routes with Test DB Container.
* **E2E (Playwright):** Critical flows (Auth, Grocery Add).

### Targets

* `packages/db`: Schema validation tests.
* `apps/api`: Route handler tests.

---

## Logging & Observability

### Structured Logging

* **Library:** Pino (JSON).
* **Fields:** `timestamp`, `level`, `household_id`, `request_id`.

### Monitoring (Self-Hosted)

* **Health Check:** `/health` endpoint checks DB/Valkey connectivity.
* **Alerting:** Simple Bash script curling `/health` and emailing on failure.

---

## Audit Logging

### Strategy

* **Triggers:** Postgres Triggers capture `OLD` and `NEW` values on `UPDATE/DELETE`.
* **Storage:** `audit_logs` table (partitioned by month).
* **Retention:** 90 days hot storage.

---

## Backup & Data Recovery

### Database

* **Tool:** `pg_dump` container sidecar.
* **Schedule:** Daily @ 02:00 UTC.
* **Destination:** Local Volume + Rclone to Cloud Storage (encrypted).

### Disaster Recovery

1. Re-deploy Docker Compose.
2. `cat backup.sql | docker exec -i db psql -U postgres`.

---

## CI/CD Pipeline

### Runner

* **Type:** Self-Hosted GitHub Actions Runner (on the Proxmox VM).

### Workflows

1. **CI (Push):** Lint, Typecheck, Test.
2. **Deploy Dev (Push to `dev`):**
* Build `web-dev` container.
* `docker compose -f docker-compose.dev.yaml up -d`.


3. **Deploy Prod (Push to `main`):**
* Backup DB.
* Build `web-prod` container (Optimized).
* `docker compose -f docker-compose.prod.yaml up -d`.



---

## Implementation Phases

### Phase 1: Monorepo Skeleton

1. Init Turborepo.
2. Setup `packages/db` with Drizzle.
3. **Checkpoint:** `bun db:migrate` works.

### Phase 2: Hybrid Core

1. Create `apps/web` & `apps/api`.
2. Implement Direct DB Access (RSC).
3. Implement Hono RPC Client.

### Phase 3: Auth (Authentik)

1. Deploy Authentik (server + worker) sharing Postgres/Valkey.
2. Configure OIDC Application with redirect URIs.
3. Implement OIDC Callback in Next.js with PKCE.
4. Map `sub` to `users.auth_id`.

### Phase 4: Real-time Groceries

1. `grocery_items` schema + RLS.
2. Server Action (Write) + Valkey Pub.
3. Hono WebSocket (Sub) + Broadcast.

### Phase 5: Budgeting

1. `transactions` schema.
2. Dashboard Charts.
3. Infinite Scroll RPC.