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
- **Infra:** Docker Compose, Caddy, Authentik

## Development

```bash
make dev-up       # Start dev containers
make dev-logs     # Tail dev logs
```

Visit https://dev-amigo.cadenalabs.net

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
- Cloudflare API token (for DNS-01 SSL via Caddy)
- Domain configured: `*.cadenalabs.net`

### First-Time Setup

1. **Environment Configuration**

   ```bash
   cp .env.example .env
   ```

   Configure required variables:
   ```bash
   POSTGRES_USER=amigo
   POSTGRES_PASSWORD=<strong-password>
   POSTGRES_DB=amigo
   AUTHENTIK_SECRET_KEY=$(openssl rand -base64 32)
   AUTHENTIK_BOOTSTRAP_PASSWORD=<initial-admin-password>
   CLOUDFLARE_API_TOKEN=<your-token>
   ```

2. **Create Directories**

   ```bash
   mkdir -p authentik/media authentik/custom-templates
   ```

3. **Start Services**

   ```bash
   docker compose -f docker-compose.prod.yaml up -d
   ```

4. **Initialize Authentik**

   Navigate to `https://auth.cadenalabs.net/if/flow/initial-setup/` and create admin account.

5. **Configure OIDC Application**

   In Authentik Admin → Applications → Create:
   - **Name:** Amigo
   - **Slug:** `amigo`
   - **Provider:** OAuth2/OpenID (Confidential)
   - **Redirect URIs:**
     ```
     https://amigo.cadenalabs.net/api/auth/callback
     https://dev-amigo.cadenalabs.net/api/auth/callback
     ```

   Update `.env`:
   ```bash
   AUTHENTIK_ISSUER=https://auth.cadenalabs.net/application/o/amigo/
   AUTHENTIK_CLIENT_ID=amigo
   AUTHENTIK_CLIENT_SECRET=<generated-secret>
   ```

### Domains

| Environment | URL |
|-------------|-----|
| Production | `https://amigo.cadenalabs.net` |
| Development | `https://dev-amigo.cadenalabs.net` |
| Auth | `https://auth.cadenalabs.net` |

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
- All `*.cadenalabs.net` subdomains are trusted (shared session cookies)
- VAPID keys configured if push notifications needed

## Troubleshooting

**OIDC Discovery Fails**
- Check Authentik is running: `docker logs amigo-authentik-server`
- Verify issuer URL ends with `/`

**Login Redirect Loop**
- Clear browser cookies for `cadenalabs.net`
- Verify redirect URIs match exactly in Authentik

**Database Connection Issues**
- Ensure postgres healthcheck passes before web starts
