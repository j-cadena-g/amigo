# Amigo Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Cloudflare API token (for DNS-01 SSL via Caddy)
- Domain configured: `*.cadenalabs.net` pointing to your server

## First-Time Setup

### 1. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and configure:

```bash
# Database credentials
POSTGRES_USER=amigo
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=amigo

# Authentik configuration
AUTHENTIK_SECRET_KEY=$(openssl rand -base64 32)
AUTHENTIK_BOOTSTRAP_PASSWORD=<initial-admin-password>
AUTHENTIK_BOOTSTRAP_EMAIL=admin@yourdomain.com
AUTHENTIK_DB_PASSWORD=<authentik-db-password>

# Cloudflare
CLOUDFLARE_API_TOKEN=<your-token>
```

### 2. Create Required Directories

```bash
mkdir -p authentik/media authentik/custom-templates
```

### 3. Start Services

```bash
docker compose -f docker-compose.prod.yaml up -d
```

### 4. Initialize Authentik

1. Navigate to `https://auth.cadenalabs.net/if/flow/initial-setup/`
2. Create your admin account using the bootstrap password
3. Complete the initial setup wizard

### 5. Configure Authentik OIDC Application

1. Go to **Admin Interface** → **Applications** → **Create**
2. Create application:
   - **Name:** Amigo
   - **Slug:** `amigo`
   - **Provider:** Create new OAuth2/OpenID Provider

3. Configure the OAuth2 Provider:
   - **Name:** Amigo OIDC
   - **Authorization flow:** default-provider-authorization-implicit-consent
   - **Client type:** Confidential
   - **Client ID:** `amigo` (or auto-generated)
   - **Client Secret:** Copy this for your `.env`
   - **Redirect URIs:**
     ```
     https://amigo.cadenalabs.net/api/auth/callback
     https://dev-amigo.cadenalabs.net/api/auth/callback
     ```
   - **Scopes:** `openid`, `profile`, `email`

4. Update your `.env` with the OIDC credentials:
   ```bash
   AUTHENTIK_ISSUER=https://auth.cadenalabs.net/application/o/amigo/
   AUTHENTIK_CLIENT_ID=amigo
   AUTHENTIK_CLIENT_SECRET=<generated-secret>
   ```

5. Restart the web services:
   ```bash
   docker compose -f docker-compose.prod.yaml up -d --build web-prod web-dev
   ```

### 6. Create Users

1. Go to **Directory** → **Users** → **Create**
2. Add household members with email addresses
3. Users can now log in at `https://amigo.cadenalabs.net`

## Domains

| Environment | URL |
|-------------|-----|
| Production | `https://amigo.cadenalabs.net` |
| Development | `https://dev-amigo.cadenalabs.net` |
| Auth/Identity | `https://auth.cadenalabs.net` |

## Common Commands

```bash
# View logs
docker compose -f docker-compose.prod.yaml logs -f

# Rebuild and restart
docker compose -f docker-compose.prod.yaml up -d --build

# Database migrations
docker compose -f docker-compose.prod.yaml exec web-prod bun db:migrate

# Stop all services
docker compose -f docker-compose.prod.yaml down
```

## Troubleshooting

### OIDC Discovery Fails
- Check that Authentik is running: `docker logs amigo-authentik-server`
- Verify the issuer URL ends with `/`
- Ensure Caddy can reach `authentik-server:9000`

### Login Redirects Loop
- Clear browser cookies for `cadenalabs.net`
- Verify redirect URIs match exactly in Authentik config
- Check Authentik logs for session errors

### Database Connection Issues
- Ensure postgres healthcheck passes before web starts
- Verify `AUTHENTIK_DB_PASSWORD` matches in postgres init script
