.PHONY: dev-up dev-down dev-logs dev-shell dev-restart dev-build \
        prod-up prod-down prod-logs prod-shell prod-build \
        up down logs build \
        db-migrate-dev db-migrate-prod db-seed-dev \
        deploy

# =============================================================================
# Full Stack (All Services)
# =============================================================================

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

# =============================================================================
# Development Stack (web-dev, api-dev)
# =============================================================================

dev-up:
	docker compose up -d web-dev api-dev

dev-down:
	docker compose stop web-dev api-dev

dev-logs:
	docker compose logs -f web-dev api-dev

dev-shell:
	docker compose exec web-dev /bin/sh

dev-restart:
	docker compose restart web-dev api-dev

dev-build:
	docker compose build web-dev api-dev

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

db-migrate-dev:
	docker compose exec api-dev bun db:migrate

db-migrate-prod:
	docker compose exec api-prod bun db:migrate

db-seed-dev:
	docker compose exec api-dev bun db:seed

# =============================================================================
# Deployment
# =============================================================================

deploy: build up db-migrate-prod
