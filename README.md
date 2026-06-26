# amigo

[![CI](https://github.com/j-cadena-g/amigo/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/j-cadena-g/amigo/actions/workflows/ci.yaml)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/j-cadena-g/amigo?labelColor=171717&color=FF570A)](https://coderabbit.ai)
[![License](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fj-cadena-g%2Famigo%2Fmain%2Fpackage.json&query=%24.license&label=License&color=blue)](https://www.gnu.org/licenses/agpl-3.0)
[![pnpm](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fj-cadena-g%2Famigo%2Fmain%2Fpackage.json&query=%24.packageManager&label=pnpm&logo=pnpm&logoColor=fff&color=F69220)](https://pnpm.io)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/j-cadena-g/amigo/dev/typescript?label=TypeScript&logo=typescript&logoColor=fff&color=3178C6)](https://www.typescriptlang.org/)
[![React Router](https://img.shields.io/github/package-json/dependency-version/j-cadena-g/amigo/react-router?label=React%20Router&logo=reactrouter&logoColor=fff&color=CA4245)](https://reactrouter.com/)
[![Wrangler](https://img.shields.io/github/package-json/dependency-version/j-cadena-g/amigo/dev/wrangler?label=Wrangler&logo=cloudflare&logoColor=fff&color=F38020)](https://developers.cloudflare.com/workers/wrangler/)

![amigo](public/icon-192.png)

Cloudflare-native household management app for shared budgeting, groceries, assets, debts, and calendar planning. The app runs as a single Worker-backed application with **React Router v8 framework mode** (SSR, loaders, actions, and `/api/*` resource routes), real-time household updates over WebSockets, and offline-first grocery syncing.

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
- Server: React Router v8 framework mode (HTTP + `/api/*` resource routes), `worker.ts` for `/ws`, cron, and security headers
- Frontend: React 19, Tailwind CSS 4, shadcn/ui (route modules under `app/routes/`)
- Data: Cloudflare D1 (SQLite) with Drizzle ORM
- Realtime and caching: Durable Objects, KV, Workers Cache API
- Offline: Dexie + `vite-plugin-pwa`
- Auth: Clerk
- Tooling: pnpm, Vite, Wrangler, ESLint, Vitest

## How it works

One Cloudflare Worker (`worker.ts`) serves everything. React Router v8 framework mode handles SSR, page loaders/actions, and `/api/*` JSON resource routes. There is no separate HTTP framework.

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

- pnpm `11.3.0+`
- Node.js on `PATH` for local helper scripts
- Wrangler `4+`
- Clerk development keys
- [1Password CLI](https://developer.1password.com/docs/cli/) and a 1Password Environment for secrets (recommended)

### Install and Run

```bash
pnpm install
pnpm run dev:setup

cp .op/refs.env.example .op/refs.env
# Set OP_ENVIRONMENT_ID to the amigo (dev) Environment UUID from 1Password.

pnpm run dev:verify
pnpm run dev
```

Open the local Vite/Workers dev URL printed by `pnpm run dev`.

### Local Environment Notes

- Copy [`.op/refs.env.example`](./.op/refs.env.example) to `.op/refs.env` and set `OP_ENVIRONMENT_ID` to the **`amigo (dev)`** Environment UUID from 1Password.
- `pnpm run dev` uses `op run --environment` to inject secrets into `process.env`; the Cloudflare Vite plugin reads them directly (`CLOUDFLARE_INCLUDE_PROCESS_ENV`). Do not mount a `.dev.vars` file.
- `pnpm run dev:verify` checks that every key from `.dev.vars.example` is present (names only; no secret values printed).
- All secrets and deploy identifiers live in 1Password Environments; the repo only tracks variable **names** in `*.example` manifests.
- `pnpm run deploy` also uses `op run` and renders an ignored `.wrangler.deploy.jsonc` from environment variables, so live Cloudflare IDs and domains do not need to live in git.

## Cursor Cloud Agents

Cursor cloud agents should **not** copy individual app secrets into the Cursor dashboard. Use the same bootstrap pattern as Cloudflare Workers Builds:

1. Create a read-only 1Password service account scoped to **`amigo (dev)`** only (separate from the prod Workers Builds token).
2. In Cursor → Cloud Agents → your amigo environment → Secrets, add only:

| Secret | Cursor type | Value |
| --- | --- | --- |
| `OP_SERVICE_ACCOUNT_TOKEN` | Runtime Secret | Read-only service account with access to **amigo (dev)** only |
| `OP_ENVIRONMENT_ID` | Environment Variable | UUID of the **amigo (dev)** Environment |

Do not add Clerk keys, VAPID keys, Cloudflare binding IDs, or other keys from `.dev.vars.example` to Cursor. Commands like `pnpm run dev` and `pnpm run dev:verify` inject them via `op run --environment` through [`scripts/run-with-1password-environment.sh`](./scripts/run-with-1password-environment.sh). Cloud agents resolve `OP_ENVIRONMENT_ID` from Cursor secrets (not from gitignored `.op/refs.env`).

For the cloud environment **install/update** command, use `pnpm install && pnpm run dev:setup` (local D1 only; no app secrets required). After bootstrap secrets are set, run `pnpm run dev:verify` to confirm the Environment is complete (names only).

Before opening a PR from a cloud agent: `pnpm run dev:verify`, `pnpm run typecheck`, `pnpm run test:unit`, and relevant `pnpm run test:integration` when touching Workers/D1/DO code.

## Environment and Config

| File / Source | Purpose |
| --- | --- |
| `.dev.vars.example` | Key manifest for local dev (`op run` + `dev:verify`) |
| `.deploy.env.example` | Deploy binding IDs and Worker vars (rendered into `.wrangler.deploy.jsonc`) |
| `.wrangler.secrets.example` | Worker secrets for local dev (`secrets.required`) and deploy (`wrangler deploy --secrets-file`) |
| `.op/refs.env.example` | Template for local `OP_ENVIRONMENT_ID` reference (copy to gitignored `.op/refs.env`) |
| `.op/refs.env` or `OP_ENVIRONMENT_ID` | 1Password Environment reference for `op run` (dev locally / cloud agents, prod in Workers Builds) |
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
| `pnpm run dev` | Start the local Vite + Workers development server |
| `pnpm run dev:verify` | Verify the amigo (dev) Environment via `op run` (names only) |
| `pnpm run dev:setup` | Apply local D1 migrations and seed the local database |
| `pnpm run dev:reset` | Remove local Wrangler state and re-run local setup |
| `pnpm run build` | Build the React Router app for production |
| `pnpm run deploy` | Apply remote D1 migrations, then deploy the Worker |
| `pnpm run db:generate` | Generate Drizzle migrations from schema changes |
| `pnpm run db:migrate:local` | Apply migrations to the local D1 database |
| `pnpm run db:migrate:remote` | Apply migrations to the remote D1 database |
| `pnpm run db:seed:local` | Seed the local D1 database from `packages/db/seed.sql` |
| `pnpm run db:studio` | Open Drizzle Studio from `packages/db` |
| `pnpm run typegen` | Generate React Router route types |
| `pnpm run typecheck` | Run route typegen and TypeScript checks |
| `pnpm run lint` | Run ESLint |
| `pnpm run test` | Run the unit and Workers integration Vitest suites |
| `pnpm run test:watch` | Run Vitest in watch mode |

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
- `/financial` — transactions, recurring rules, budgets, accounts, and debts (legacy `/budget` → `/financial`, `/accounts` → `/financial/accounts`, `/assets` → `/financial/accounts`)
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

`pnpm run deploy` first renders `.wrangler.deploy.jsonc` from the current shell environment, then uses that ignored file for remote D1 migrations and the Worker deploy. The committed [`wrangler.jsonc`](./wrangler.jsonc) stays as a public-safe template.

All production and development secrets are stored in [1Password Environments](https://www.1password.dev/environments/) only. The repo tracks **names** in [`.deploy.env.example`](./.deploy.env.example) and [`.wrangler.secrets.example`](./.wrangler.secrets.example). Do not use `wrangler secret put` or the Cloudflare dashboard to author secrets — `pnpm run deploy` renders a temporary secrets file from `op run` and passes it to `wrangler deploy --secrets-file`.

**`amigo (dev)`** — local `pnpm run dev` and optional manual deploys (`OP_ENVIRONMENT_ID` in `.op/refs.env`).

**`amigo (prod)`** — Cloudflare Workers Builds (`OP_ENVIRONMENT_ID` build secret).

Each Environment should define every key from both manifests (dev vs prod values differ, e.g. `pk_test_` vs `pk_live_`).

Local deploy: copy [`.op/refs.env.example`](./.op/refs.env.example) to `.op/refs.env`, set `OP_ENVIRONMENT_ID` to **`amigo (dev)`**, then `pnpm run deploy`. Production deploys use **`amigo (prod)`** via Workers Builds.

### Cloudflare Workers Builds

Git-connected production deploys must not use the placeholder [`wrangler.jsonc`](./wrangler.jsonc) alone. After [#53](https://github.com/j-cadena-g/amigo/pull/53), the build must render `.wrangler.deploy.jsonc` with real binding IDs.

1. Use the **`amigo (prod)`** 1Password Environment (production binding IDs and deploy keys). Keep **`amigo (dev)`** for local development only.
2. Add every key from [`.deploy.env.example`](./.deploy.env.example) and [`.wrangler.secrets.example`](./.wrangler.secrets.example) to `amigo (prod)` in the 1Password app.
3. Add Workers Builds secrets: `OP_SERVICE_ACCOUNT_TOKEN` (read-only service account) and `OP_ENVIRONMENT_ID` set to the **`amigo (prod)`** Environment UUID from 1Password.
4. Set the deploy step to `pnpm run deploy` after `pnpm install` and `pnpm run build` (same command as local deploy; installs pinned `op` when needed).

If Workers Builds was still running plain `wrangler deploy` against the template config, the post-merge failure is expected: add the bootstrap secrets and set the deploy command to `pnpm run deploy`.

The generated deploy config contains:

- Worker name `amigo`
- Smart placement enabled
- Observability and tracing enabled
- Custom domain route from `CLOUDFLARE_CUSTOM_DOMAIN`
- `workers_dev` disabled

If you want to deploy this project to a different Cloudflare account or domain, change the deploy-time environment variables instead of editing the committed `wrangler.jsonc`.

## CI

GitHub Actions in [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml) currently run:

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`

on pushes to `main` and pull requests targeting `main`.

This workflow does not deploy the app.

### Main branch protection

For security hardening, `main` uses a repository ruleset: pull requests with review, required CI and CodeQL checks, signed commits, and linear history. **Merge commits are disabled** at the repository level; changes land via squash or rebase merge only. See [Contributing § Main branch policy](./CONTRIBUTING.md#main-branch-policy-security-hardening) for contributor-facing details.

## License

Copyright © 2026 James Cadena.

[GNU Affero General Public License v3.0](LICENSE) (SPDX `AGPL-3.0`). AGPL is a **strong copyleft** license: modified versions must stay under the same license when conveyed, and if you run a modified version as a **network service** for others, you generally must offer them the corresponding source as well (see section 13 of the license). This is not legal advice; read the full text in `LICENSE`.

## Additional Docs

- [Changelog](./CHANGELOG.md) — release history
- [Contributing](./CONTRIBUTING.md) — development setup, PR expectations, AGPL note
- [Security](./SECURITY.md) — reporting vulnerabilities responsibly
