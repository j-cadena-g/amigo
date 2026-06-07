# amigo

[![CI](https://github.com/j-cadena-g/amigo/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/j-cadena-g/amigo/actions/workflows/ci.yaml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Bun](https://img.shields.io/badge/Bun-1.3.10-000?logo=bun&logoColor=fff)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff)](https://developers.cloudflare.com/workers/)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/j-cadena-g/amigo?utm_source=oss&utm_medium=github&utm_campaign=j-cadena-g%2Famigo&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

![amigo](public/icon-192.png)

Cloudflare-native household management app for shared budgeting, groceries, assets, debts, and calendar planning. The app runs as a single Worker-backed application with **React Router v7 framework mode** (SSR, loaders, actions, and `/api/*` resource routes), real-time household updates over WebSockets, and offline-first grocery syncing.

## What It Does

- Shared household dashboard and setup flow
- Budget tracking with transactions, budgets, and recurring entries
- Grocery list management with tags, optimistic updates, and offline sync
- Asset and debt tracking
- Calendar aggregation for household activity
- Household settings, member roles, and account restore flows
- Real-time updates through a household-scoped Durable Object WebSocket hub

## Stack

- Runtime: Cloudflare Workers
- Server: React Router v7 framework mode (HTTP + `/api/*` resource routes), `worker.ts` for `/ws`, cron, and security headers
- Frontend: React 19, Tailwind CSS 4, shadcn/ui (route modules under `app/routes/`)
- Data: Cloudflare D1 (SQLite) with Drizzle ORM
- Realtime and caching: Durable Objects, KV, Workers Cache API
- Offline: Dexie + `vite-plugin-pwa`
- Auth: Clerk
- Tooling: Bun, Vite, Wrangler, ESLint, Vitest

## How it works

One Cloudflare Worker (`worker.ts`) serves everything. React Router v7 framework mode handles SSR, page loaders/actions, and `/api/*` JSON resource routes. There is no separate HTTP framework.

### Design choices

- **Single Worker** — RR plus Worker-only concerns (`/ws`, cron, security headers) in one deployable unit
- **Integer cents** — all money in D1 is stored as integer cents (never floats)
- **Application-level tenancy** — every D1 query must filter with `scopeToHousehold()` from `@amigo/db` (no DB-level RLS)
- **Optimistic groceries** — Dexie (IndexedDB) for instant UI; background sync via `/api/sync` (max 10 mutations per request)

### Request flow

```text
Client → worker.ts
  → /ws → Household Durable Object (WebSocket hub)
  → else → React Router (createRequestHandler)
      → clerkMiddleware + app context middleware
      → /api/* resource routes → server/api/* handlers
      → page loaders/actions (context.app + context.cloudflare)
```

### Code layout

- `app/routes/*.tsx` — pages and `api.*` resource routes
- `server/api/*` — shared handlers (Zod validation, D1, rate limits)
- `server/durable-objects/household.ts` — per-household WebSocket hub (Hibernation API)
- `packages/db/` — Drizzle schema, migrations, `getDb()`, `scopeToHousehold()`

Sync-enabled tables use `deletedAt` for soft deletes. Schema lives under `packages/db/src/schema/`.

### Realtime

1. Client opens `/ws` → routed to the household’s Durable Object
2. Mutations call `broadcastToHousehold()` in `server/lib/realtime.ts`
3. Connected clients receive an event and revalidate loaders
4. Optional `senderId` skips the connection that initiated the mutation

### Auth (Clerk)

- `@clerk/react-router` for middleware, loaders, and client provider
- Session cache in KV (24h TTL, keyed by Clerk user id)
- First login auto-creates household + user rows in D1

### Security

KV-backed rate limits (`server/middleware/rate-limit.ts`):

| Preset | Limit | Use case |
| --- | --- | --- |
| MUTATION | 30/min | Standard writes |
| BULK | 10/min | Bulk operations |
| SENSITIVE | 10/min | Settings, members |
| READ | 60/min | List reads |

Household roles (`owner` > `admin` > `member`): `canManageHousehold` and `canManageMembers` require owner or admin; `canTransferOwnership` is owner-only. Helpers live in `server/lib/permissions.ts`.

### Offline groceries

- Local state in Dexie; sync queue flushed in chunks to `/api/sync`
- Conflicts: server-wins with field-level merge
- PWA via `vite-plugin-pwa` (NetworkFirst for API, CacheFirst for static assets)

## Quick Start

### Prerequisites

- Bun `1.3.10+`
- Node.js on `PATH` for local helper scripts
- Wrangler `4+`
- Clerk development keys
- [1Password CLI](https://developer.1password.com/docs/cli/) and a 1Password Environment for secrets (recommended)

### Install and Run

```bash
bun install
bun run dev:setup

cp .op/refs.env.example .op/refs.env
# Set OP_ENVIRONMENT_ID to the amigo (dev) Environment UUID from 1Password.

bun run dev:verify
bun run dev
```

Open the local Vite/Workers dev URL printed by `bun run dev`.

### Local Environment Notes

- Copy [`.op/refs.env.example`](./.op/refs.env.example) to `.op/refs.env` and set `OP_ENVIRONMENT_ID` to the **`amigo (dev)`** Environment UUID from 1Password.
- `bun run dev` uses `op run --environment` to inject secrets into `process.env`; the Cloudflare Vite plugin reads them directly (`CLOUDFLARE_INCLUDE_PROCESS_ENV`). Do not mount a `.dev.vars` file.
- `bun run dev:verify` checks that every key from `.dev.vars.example` is present (names only; no secret values printed).
- All secrets and deploy identifiers live in 1Password Environments; the repo only tracks variable **names** in `*.example` manifests.
- `bun run deploy` also uses `op run` and renders an ignored `.wrangler.deploy.jsonc` from environment variables, so live Cloudflare IDs and domains do not need to live in git.

## Environment and Config

| File / Source | Purpose |
| --- | --- |
| `.dev.vars.example` | Key manifest for local dev (`op run` + `dev:verify`) |
| `.deploy.env.example` | Deploy binding IDs and Worker vars (rendered into `.wrangler.deploy.jsonc`) |
| `.wrangler.secrets.example` | Worker secrets for local dev (`secrets.required`) and deploy (`wrangler deploy --secrets-file`) |
| `.op/refs.env.example` | Template for local `OP_ENVIRONMENT_ID` reference (copy to gitignored `.op/refs.env`) |
| `.op/refs.env` or `OP_ENVIRONMENT_ID` | 1Password Environment reference for `op run` (dev locally, prod in Workers Builds) |
| `wrangler.jsonc` | Public-safe Wrangler template used for local development and documentation |
| `.wrangler.deploy.jsonc` | Ignored production config rendered at deploy time from environment variables |

Current Worker bindings in the public `wrangler.jsonc` template:

- D1 database binding: `DB` (`amigo-db`)
- KV namespace: `CACHE`
- Durable Object: `HOUSEHOLD`
- Static asset binding: `ASSETS`
- Weekly cron: Sunday at `03:00 UTC` for audit log pruning

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the local Vite + Workers development server |
| `bun run dev:verify` | Verify the amigo (dev) Environment via `op run` (names only) |
| `bun run dev:setup` | Apply local D1 migrations and seed the local database |
| `bun run dev:reset` | Remove local Wrangler state and re-run local setup |
| `bun run build` | Build the React Router app for production |
| `bun run deploy` | Apply remote D1 migrations, then deploy the Worker |
| `bun run db:generate` | Generate Drizzle migrations from schema changes |
| `bun run db:migrate:local` | Apply migrations to the local D1 database |
| `bun run db:migrate:remote` | Apply migrations to the remote D1 database |
| `bun run db:seed:local` | Seed the local D1 database from `packages/db/seed.sql` |
| `bun run db:studio` | Open Drizzle Studio from `packages/db` |
| `bun run typegen` | Generate React Router route types |
| `bun run typecheck` | Run route typegen and TypeScript checks |
| `bun run lint` | Run ESLint |
| `bun run test` | Run Vitest once |
| `bun run test:watch` | Run Vitest in watch mode |

## Project Layout

```text
app/                 React Router UI, route modules (pages + `api.*` resource routes), client utilities
server/              Shared API handlers, middleware, libs, and Durable Objects (called from route modules)
packages/db/         Shared D1 schema, migrations, seed data, and DB helpers
public/              PWA icons and other static assets
scripts/             Local development and migration helper scripts
worker.ts            Cloudflare Worker entrypoint with fetch + scheduled handlers
wrangler.jsonc       Cloudflare configuration and bindings
CHANGELOG.md         Release history
```

Notable route groups:

- `/dashboard`
- `/groceries`
- `/budget`, `/budget/budgets`, `/budget/recurring`
- `/financial` — accounts and holdings (checking, savings, cash, investments, property, credit cards; legacy `/accounts` → `/financial`, `/assets` → `/financial`)
- `/financial/debts` — debts (legacy `/debts` → `/financial/debts`)
- `/calendar` — redirects to `/dashboard`
- `/settings`
- `/setup`
- `/restore-account`

Notable API groups:

- `/api/health`
- `/api/setup`
- `/api/groceries`
- `/api/tags`
- `/api/transactions`
- `/api/budgets`
- `/api/recurring`
- `/api/assets`
- `/api/debts`
- `/api/members`
- `/api/settings`
- `/api/sync`
- `/api/calendar`
- `/api/restore`
- `/api/audit`

## Deployment

`bun run deploy` first renders `.wrangler.deploy.jsonc` from the current shell environment, then uses that ignored file for remote D1 migrations and the Worker deploy. The committed [`wrangler.jsonc`](./wrangler.jsonc) stays as a public-safe template.

All production and development secrets are stored in [1Password Environments](https://www.1password.dev/environments/) only. The repo tracks **names** in [`.deploy.env.example`](./.deploy.env.example) and [`.wrangler.secrets.example`](./.wrangler.secrets.example). Do not use `wrangler secret put` or the Cloudflare dashboard to author secrets — `bun run deploy` renders a temporary secrets file from `op run` and passes it to `wrangler deploy --secrets-file`.

**`amigo (dev)`** — local `bun run dev` and optional manual deploys (`OP_ENVIRONMENT_ID` in `.op/refs.env`).

**`amigo (prod)`** — Cloudflare Workers Builds (`OP_ENVIRONMENT_ID` build secret).

Each Environment should define every key from both manifests (dev vs prod values differ, e.g. `pk_test_` vs `pk_live_`).

Local deploy: copy [`.op/refs.env.example`](./.op/refs.env.example) to `.op/refs.env`, set `OP_ENVIRONMENT_ID` to **`amigo (dev)`**, then `bun run deploy`. Production deploys use **`amigo (prod)`** via Workers Builds.

### Cloudflare Workers Builds

Git-connected production deploys must not use the placeholder [`wrangler.jsonc`](./wrangler.jsonc) alone. After [#53](https://github.com/j-cadena-g/amigo/pull/53), the build must render `.wrangler.deploy.jsonc` with real binding IDs.

1. Use the **`amigo (prod)`** 1Password Environment (production binding IDs and deploy keys). Keep **`amigo (dev)`** for local development only.
2. Add every key from [`.deploy.env.example`](./.deploy.env.example) and [`.wrangler.secrets.example`](./.wrangler.secrets.example) to `amigo (prod)` in the 1Password app.
3. Add Workers Builds secrets: `OP_SERVICE_ACCOUNT_TOKEN` (read-only service account) and `OP_ENVIRONMENT_ID` set to the **`amigo (prod)`** Environment UUID from 1Password.
4. Set the deploy step to run [`scripts/workers-build-deploy.sh`](./scripts/workers-build-deploy.sh) after `bun install` and `bun run build`.

If Workers Builds was still running plain `wrangler deploy` against the template config, the post-merge failure is expected: add the bootstrap secrets and switch the deploy command to the script above.

The generated deploy config contains:

- Worker name `amigo`
- Smart placement enabled
- Observability and tracing enabled
- Custom domain route from `CLOUDFLARE_CUSTOM_DOMAIN`
- `workers_dev` disabled

If you want to deploy this project to a different Cloudflare account or domain, change the deploy-time environment variables instead of editing the committed `wrangler.jsonc`.

## CI

GitHub Actions in [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml) currently run:

- `bun run lint`
- `bun run typecheck`
- `bun run test`

on pushes to `main` and pull requests targeting `main`.

This workflow does not deploy the app.

## License

Copyright © 2026 James Cadena.

[GNU Affero General Public License v3.0](LICENSE) (SPDX `AGPL-3.0`). AGPL is a **strong copyleft** license: modified versions must stay under the same license when conveyed, and if you run a modified version as a **network service** for others, you generally must offer them the corresponding source as well (see section 13 of the license). This is not legal advice; read the full text in `LICENSE`.

## Additional Docs

- [Changelog](./CHANGELOG.md) — release history
- [Contributing](./CONTRIBUTING.md) — development setup, PR expectations, AGPL note
- [Security](./SECURITY.md) — reporting vulnerabilities responsibly
