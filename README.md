# amigo

<p align="center">
  <img src="docs/images/amigo-original.png" alt="amigo" width="200" />
</p>

Household management app for budgeting, groceries, assets, debts, and calendar — deployed on Cloudflare Workers.

## Tech Stack

- **Runtime:** Cloudflare Workers (V8 isolates)
- **Server:** Hono
- **Frontend:** React Router v7 (SSR) + React 19
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM
- **Auth:** Clerk
- **Real-time:** Durable Objects (WebSocket Hibernation API)
- **Cache/Rate limiting:** Cloudflare KV
- **Offline:** Dexie (IndexedDB) + vite-plugin-pwa
- **Styling:** Tailwind CSS 4 + Shadcn/UI

## Development

```bash
bun install                # Install dependencies
cp .dev.vars.example .dev.vars  # Configure local secrets
bun run dev:setup          # Apply D1 migrations + seed local DB
bun run dev                # Start dev server (Vite + Workers runtime)
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run dev:setup` | Apply migrations + seed |
| `bun run dev:reset` | Wipe local state and re-seed |
| `bun run build` | Production build |
| `bun run deploy` | Deploy to Cloudflare Workers |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | ESLint |
| `bun run test` | Vitest |
| `bun run db:generate` | Generate migration from schema changes |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run db:migrate:remote` | Apply migrations to production D1 |
| `bun run db:studio` | Open Drizzle Studio |

## Project Structure

```
app/           React Router v7 frontend (routes, components, lib)
server/        Hono backend (API routes, middleware, lib)
packages/db/   Drizzle ORM schemas and D1 migrations
worker.ts      Worker entrypoint (fetch + scheduled handler)
wrangler.jsonc Cloudflare bindings configuration
```

## Deployment

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (v4+)
- Cloudflare account with Workers paid plan

### First-Time Setup

1. **Create Cloudflare resources**

   ```bash
   wrangler d1 create amigo-db
   wrangler kv namespace create CACHE
   ```

2. **Update `wrangler.jsonc`** with the database and KV namespace IDs from step 1

3. **Set production secrets**

   ```bash
   wrangler secret put CLERK_SECRET_KEY
   wrangler secret put CLERK_PUBLISHABLE_KEY
   ```

4. **Apply migrations and deploy**

   ```bash
   bun run db:migrate:remote
   bun run build
   bun run deploy
   ```

### Environment Configuration

| Source | Purpose |
|--------|---------|
| `.dev.vars` | Local development secrets (copy from `.dev.vars.example`) |
| `wrangler.jsonc` | Non-secret config (D1, KV, DO bindings, `vars`) |
| `wrangler secret` | Production secrets |

### CI/CD (GitHub Actions)

- **Push/PR to master:** Lint, typecheck, test
- **Merge to master:** Production deploy via `wrangler deploy`

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`
