# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

amigo is a self-hosted household budgeting application with grocery tracking for `cadenalabs.net`. It's a TypeScript monorepo using Turborepo, deployed on Proxmox via Docker + Tailscale.

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

# Database
bun db:generate    # Generate migrations from schema changes
bun db:migrate     # Apply pending migrations

# Testing
bun test           # Unit + Integration tests (Vitest)
bun test:e2e       # E2E tests (Playwright)
bun test:coverage  # Coverage report

# Quality
bun run lint
bun run typecheck
bun audit

# Docker (production)
docker compose -f docker-compose.prod.yaml up -d
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

| Context           | Access Method                     | Why                              |
| ----------------- | --------------------------------- | -------------------------------- |
| Server Components | Direct DB via `@amigo/db`         | Lowest latency, no HTTP overhead |
| Client Components | Hono RPC client                   | Type-safe fetching for browser   |
| Mutations         | Server Actions and Valkey publish | Direct DB write, then broadcast  |

### Code Organization

- Server Components import `@amigo/db` directly for reads
- Client Components use `@amigo/api` RPC client for reads
- Server Actions import `@amigo/db` directly, publish to Valkey for real-time sync
- Hono (`apps/api`) handles WebSockets and delta sync only

### Multi-tenancy

Row-Level Security (RLS) enforced at database level using `household_id` on all data tables.

## Key Patterns

- **Optimistic UI:** Grocery list uses React 19's `useOptimistic` for instant feedback
- **Real-time:** Server Action → Valkey pub → Hono subscription → WebSocket broadcast
- **Delta Sync:** Reconnection fetches only records where `updated_at > lastSyncTimestamp`
- **Soft Deletes:** Tables use `deleted_at` column for delta sync compatibility

## Domain

- **Prod:** `amigo.cadenalabs.net`
- **Dev:** `dev-amigo.cadenalabs.net`
- **Cookie scope:** `.cadenalabs.net`
