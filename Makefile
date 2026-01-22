.PHONY: dev-up dev-up-with-authentik dev-down dev-down-with-authentik dev-logs dev-shell dev-restart dev-build \
        prod-up prod-down prod-logs prod-shell prod-build \
        up down logs build up-with-authentik down-with-authentik \
        authentik-up authentik-down authentik-logs \
        db-migrate db-generate db-push db-studio db-seed \
        db-backup db-backup-list db-restore \
        audit-stats audit-prune \
        caddy-prod caddy-dev caddy-reload \
        deploy deploy-fresh rebuild

# =============================================================================
# Full Stack (Core Services - without bundled Authentik)
# =============================================================================
# Use these if you have an external OIDC provider (existing Authentik, etc.)

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

# =============================================================================
# Full Stack WITH Bundled Authentik
# =============================================================================
# Use these if you want to run Authentik as part of this stack

up-with-authentik:
	docker compose --profile authentik up -d

down-with-authentik:
	docker compose --profile authentik down

# =============================================================================
# Authentik Only (Identity Provider)
# =============================================================================
# Manage just the Authentik services

authentik-up:
	docker compose --profile authentik up -d authentik-server authentik-worker

authentik-down:
	docker compose --profile authentik stop authentik-server authentik-worker

authentik-logs:
	docker compose --profile authentik logs -f authentik-server authentik-worker

# =============================================================================
# Development Stack (web-dev, api-dev)
# =============================================================================

dev-up:
	docker compose up -d web-dev api-dev

dev-up-with-authentik:
	docker compose --profile authentik up -d web-dev api-dev

dev-down:
	docker compose stop web-dev api-dev

dev-down-with-authentik:
	docker compose --profile authentik stop web-dev api-dev

dev-logs:
	docker compose logs -f web-dev api-dev

dev-shell:
	docker compose exec web-dev /bin/sh

dev-restart:
	docker compose restart web-dev api-dev

dev-build:
	docker compose build web-dev api-dev

# Quick rebuild dev - force recreate containers with new code
dev-rebuild:
	docker compose build web-dev api-dev
	docker compose up -d --force-recreate web-dev api-dev

# =============================================================================
# Hot Reload Development (choose one method)
# =============================================================================

# Option 1: Docker-based hot reload (container isolation)
# Use when you need full container environment
dev-hot-up:
	@docker compose stop web-dev 2>/dev/null || true
	docker compose up -d web-dev-hot api-dev

dev-hot-down:
	docker compose stop web-dev-hot api-dev

dev-hot-logs:
	docker compose logs -f web-dev-hot api-dev

dev-hot-build:
	docker compose build web-dev-hot api-dev

dev-hot-restart:
	docker compose restart web-dev-hot

# Option 2: Local hot reload (fastest, recommended)
# Runs Next.js dev server locally, uses Docker for Postgres/Valkey only
dev-local:
	@docker compose stop web-dev web-dev-hot 2>/dev/null || true
	@echo "Starting local dev server with hot reload..."
	@echo "Database: localhost:5432, Valkey: localhost:6379"
	@bash -c 'source .env && \
		export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}_dev" && \
		export VALKEY_URL="redis://localhost:6379" && \
		export APP_URL="$${DEV_APP_URL:-$${APP_URL}}" && \
		cd apps/web && bun run dev --port 3001'

# Run all apps locally with turbo (web + api)
dev-local-all:
	@docker compose stop web-dev web-dev-hot api-dev 2>/dev/null || true
	@echo "Starting all dev servers locally with hot reload..."
	@bash -c 'source .env && \
		export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}_dev" && \
		export VALKEY_URL="redis://localhost:6379" && \
		export APP_URL="$${DEV_APP_URL:-$${APP_URL}}" && \
		bun run dev'

# =============================================================================
# Production Stack (web-prod, api-prod)
# =============================================================================

prod-up:
	docker compose up -d web-prod api-prod

prod-down:
	docker compose stop web-prod api-prod

prod-logs:
	docker compose logs -f web-prod api-prod

prod-shell:
	docker compose exec web-prod /bin/sh

prod-build:
	docker compose build web-prod api-prod

# =============================================================================
# Database Utilities
# =============================================================================

# Run migrations (uses local drizzle-kit with DATABASE_URL from .env)
db-migrate:
	@bash -c 'source .env && export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}" && cd packages/db && bun run db:migrate'

# Generate migrations from schema changes
db-generate:
	@bash -c 'source .env && export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}" && cd packages/db && bun run db:generate'

# Push schema directly (no migrations, useful for dev)
db-push:
	@bash -c 'source .env && export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}" && cd packages/db && bun run db:push'

# Open Drizzle Studio
db-studio:
	@bash -c 'source .env && export DATABASE_URL="postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:5432/$${POSTGRES_DB}" && cd packages/db && bun run db:studio'

# Seed the database (runs in dev container)
db-seed:
	docker compose exec api-dev bun run --cwd /app/packages/db db:seed

# Backup databases (production and dev)
db-backup:
	./scripts/backup.sh

# List available backups
db-backup-list:
	./scripts/backup.sh --list

# Restore from backup (usage: make db-restore FILE=backup_file.sql.gz)
db-restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=<backup_file>"; exit 1; fi
	./scripts/backup.sh --restore $(FILE)

# =============================================================================
# Audit Log Management
# =============================================================================
# 90-day retention policy (configurable via AUDIT_RETENTION_DAYS)

# Show audit log statistics
audit-stats:
	./scripts/audit-retention.sh --count

# Prune audit logs older than retention period (default: 90 days)
audit-prune:
	./scripts/audit-retention.sh

# Dry run - show what would be pruned without deleting
audit-prune-dry:
	./scripts/audit-retention.sh --dry-run

# =============================================================================
# Caddy Configuration (Reverse Proxy)
# =============================================================================
# Use separate Caddyfiles to reduce accidental production misconfiguration

# Use production-only Caddyfile (recommended for production servers)
caddy-prod:
	CADDYFILE=Caddyfile.prod docker compose up -d caddy

# Use development-only Caddyfile
caddy-dev:
	CADDYFILE=Caddyfile.dev docker compose up -d caddy

# Reload Caddy configuration without restart
caddy-reload:
	docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# =============================================================================
# Deployment
# =============================================================================

# Standard deploy - builds, restarts services, and runs migrations
deploy:
	docker compose build web-prod api-prod
	docker compose up -d web-prod api-prod
	$(MAKE) db-migrate

# Force rebuild from scratch (use when code changes aren't being picked up)
deploy-fresh:
	docker compose build --no-cache web-prod api-prod
	docker compose up -d web-prod api-prod
	$(MAKE) db-migrate

# Quick rebuild - force recreate containers (no migrations)
rebuild:
	docker compose build web-prod api-prod
	docker compose up -d --force-recreate web-prod api-prod
