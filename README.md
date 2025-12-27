# amigo

Self-hosted household management app for budgeting and grocery tracking.

## Tech Stack

- **Runtime:** Bun
- **Frontend:** Next.js 15, React 19, Tailwind v4, Shadcn/UI
- **Backend:** Hono (WebSockets), Next.js Server Actions
- **Database:** Postgres 17, Drizzle ORM, Valkey 8
- **Infra:** Docker Compose, Caddy, Authentik

## Development

```bash
make up          # Start all services
make dev-logs    # Tail dev logs
```

Visit http://localhost:3000

## Production

```bash
make deploy      # Build, start, and migrate
make prod-logs   # Tail prod logs
```

## Commands

| Command | Description |
| --- | --- |
| `make up` | Start all services |
| `make down` | Stop all services |
| `make build` | Build containers |
| `make dev-up` | Start dev stack only |
| `make prod-up` | Start prod stack only |
| `make deploy` | Build, start, and migrate prod |
