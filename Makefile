.PHONY: dev-up dev-down dev-logs dev-shell dev-restart \
        prod-up prod-down prod-logs prod-pull prod-shell \
        db-migrate-dev db-migrate-prod db-seed-dev \
        deploy

# =============================================================================
# Development (Base + Dev Override)
# Chaining: -f docker-compose.yaml -f docker-compose.dev.yaml
# Ports: 3000/3001
# =============================================================================

dev-up:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d

dev-down:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down

dev-logs:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml logs -f

dev-shell:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml exec web-dev /bin/sh

dev-restart:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml restart

# =============================================================================
# Production (Base + Prod Override)
# Chaining: -f docker-compose.yaml -f docker-compose.prod.yaml
# Ports: 3100/3101
# =============================================================================

prod-up:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

prod-down:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml down

prod-logs:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml logs -f

prod-pull:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml pull

prod-shell:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml exec web-prod /bin/sh

# =============================================================================
# Database Utilities
# =============================================================================

db-migrate-dev:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml exec api-dev bun db:migrate

db-migrate-prod:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml exec api-prod bun db:migrate

db-seed-dev:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml exec api-dev bun db:seed

# =============================================================================
# Deployment
# =============================================================================

deploy: prod-pull prod-up db-migrate-prod
