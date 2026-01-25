# amigo

<p align="center">
  <img src="apps/web/public/amigo-original.png" alt="amigo" width="200" />
</p>

Self-hosted household management app for budgeting and grocery tracking.

## Tech Stack

- **Runtime:** Bun
- **Frontend:** Next.js 15, React 19, Tailwind v4, Shadcn/UI
- **Backend:** Hono (WebSockets), Next.js Server Actions
- **Database:** Postgres 17, Drizzle ORM, Valkey 8
- **Infra:** Docker Compose, Tailscale

### External Services (Standalone Stacks)

Caddy and Authentik run as separate Docker Compose stacks on the same VM:

| Service | Location | Purpose |
|---------|----------|---------|
| Caddy | `~/caddy/` | Reverse proxy with Cloudflare DNS-01 SSL |
| Authentik | `~/authentik/` | OIDC identity provider |

All services communicate via the shared `caddy-network` Docker network.

## Development

```bash
make dev-up       # Start dev containers
make dev-logs     # Tail dev logs
```

Visit `https://dev-amigo.yourdomain.com` (configure your domain in `.env`)

## Production

```bash
make deploy       # Build, start, and migrate
make prod-logs    # Tail prod logs
```

## Commands

| Command | Description |
|---------|-------------|
| `make dev-up` | Start dev stack |
| `make prod-up` | Start prod stack |
| `make deploy` | Build, start, and migrate prod |
| `make down` | Stop all services |
| `make db-studio` | Open Drizzle Studio |

## Deployment

### Prerequisites

- Docker & Docker Compose
- Standalone Caddy stack running (see `~/caddy/`)
- Standalone Authentik stack running (see `~/authentik/`)
- Shared Docker network: `docker network create caddy-network`

### First-Time Setup

1. **Set up external services first:**
   - Caddy: `cd ~/caddy && make up`
   - Authentik: `cd ~/authentik && make up`

2. **Environment Configuration**

   ```bash
   cp .env.example .env
   ```

   Configure required variables:
   ```bash
   POSTGRES_USER=amigo
   POSTGRES_PASSWORD=<strong-password>
   POSTGRES_DB=amigo

   # OIDC credentials from Authentik
   AUTHENTIK_ISSUER=https://auth.yourdomain.com/application/o/amigo/
   AUTHENTIK_CLIENT_ID=<from-authentik>
   AUTHENTIK_CLIENT_SECRET=<from-authentik>
   ```

3. **Start Services**

   ```bash
   make up
   ```

4. **Configure OIDC Application** (if not already done)

   In Authentik Admin → Applications → Create:
   - **Name:** Amigo
   - **Slug:** `amigo`
   - **Provider:** OAuth2/OpenID (Confidential)
   - **Redirect URIs:**
     ```
     https://amigo.yourdomain.com/api/auth/callback
     https://dev-amigo.yourdomain.com/api/auth/callback
     ```

### Domains

| Environment | URL |
|-------------|-----|
| Production | `https://amigo.yourdomain.com` |
| Development | `https://dev-amigo.yourdomain.com` |
| Auth | `https://auth.yourdomain.com` |

## Security Checklist

### Required Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Fails at startup if missing |
| `VALKEY_URL` | Yes | Fails at startup if missing |
| `CORS_ORIGINS` | No | Defaults to prod domain; **never `*`** |
| `VAPID_*` | No | Push disabled if missing (warning logged) |

### Verify Before Deploy

- CORS not set to wildcard in production
- All subdomains of your configured domain are trusted (shared session cookies)
- VAPID keys configured if push notifications needed

## Troubleshooting

**OIDC Discovery Fails**
- Check Authentik is running: `cd ~/authentik && make status`
- View Authentik logs: `cd ~/authentik && make logs`
- Verify issuer URL ends with `/`

**Login Redirect Loop**
- Clear browser cookies for your domain
- Verify redirect URIs match exactly in Authentik

**Database Connection Issues**
- Ensure postgres healthcheck passes before web starts

**Service Communication Issues**
- Verify all services are on the same network: `docker network inspect caddy-network`
- Check Caddy can reach services: `cd ~/caddy && make logs`
