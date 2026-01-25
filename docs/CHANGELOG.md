# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3] - 2026-01-24

### Infrastructure

- **Standalone Authentik Stack**
  - Separate Authentik identity provider to `~/authentik/` with dedicated PostgreSQL and Valkey
  - Independent scaling and management from the amigo application stack
  - Data migration from shared amigo PostgreSQL to dedicated instance

- **Service Isolation**
  - Use explicit container names (`amigo-postgres`, `amigo-valkey`) in connection strings
  - Prevents DNS conflicts with other services on shared `caddy-network`
  - All three stacks (Caddy, Authentik, Amigo) now fully isolated

### Changed

- **Docker Compose**
  - Remove Authentik services from amigo docker-compose.yaml
  - Update DATABASE_URL to use `amigo-postgres` instead of `postgres`
  - Update VALKEY_URL to use `amigo-valkey` instead of `valkey`

- **Makefile**
  - Remove Authentik-related make targets (authentik-up, authentik-down, etc.)
  - Simplify to core amigo stack management only

### Fixed

- Unused `args` parameter in `apps/api/src/lib/redis.ts` (lint error)
- ESLint now ignores bundled `sw.js` service worker file

### Documentation

- Update ARCHITECTURE.md with standalone service architecture
- Add container names reference table
- Update README.md with external service prerequisites
- Update CLAUDE.md with standalone service commands
- Remove redundant caddy-external-setup.md (consolidated into ARCHITECTURE.md)

## [0.2.2] - 2026-01-24

### Changed

- **Grocery Module Refactoring**
  - Break down monolithic 1540-line GroceryList component into focused modules
  - New structure under `apps/web/src/components/groceries/`:
    - `constants.ts`: Tag colors and date formatting helpers
    - `types.ts`: Shared types (GroceryItemWithTags, OptimisticAction)
    - `grocery-icons.tsx`: Extracted SVG icon components
    - `tag-badge.tsx`: Reusable tag badge component
    - `tag-selector.tsx`: Unified TagSelector (merged global + item modes)
    - `grocery-item.tsx`: Individual item row with long-press handling
    - `history-section.tsx`: Collapsible history with date grouping
    - `date-picker-modal.tsx`: Purchase date picker modal
    - `use-grocery-logic.ts`: Custom hook for state, actions, WebSocket
    - `grocery-list.tsx`: Clean container component
    - `index.ts`: Public exports

### Added

- **Purchase Date Editing**
  - Long-press checkbox to set custom purchase date
  - `updatePurchaseDate` server action

### Fixed

- Button alignment for tag and delete icons on grocery items

### Documentation

- Remove PII from documentation (personal names)
- Replace hardcoded domain with `yourdomain.com` placeholder
- Add `APP_DOMAIN` environment variable reference
- Clarify `bun run test` vs `bun test` usage in CLAUDE.md

## [0.2.1] - 2026-01-22

### Added

- **Branding**
  - Add Amigo logo throughout the app (navbar, login, empty states, loading)
  - Reusable `EmptyState` and `Loading` components with logo

- **Database Backup**
  - Automated PostgreSQL backup script with 7-day rotation
  - Makefile targets: `db-backup`, `db-backup-list`, `db-restore`

- **Audit Log Retention**
  - Automated retention script with configurable period
  - Batch deletion to prevent long-running transactions
  - Makefile targets: `audit-stats`, `audit-prune`, `audit-prune-dry`

### Changed

- **Caddyfile Split**
  - Separate `Caddyfile.prod` (stricter CSP) and `Caddyfile.dev` (allows HMR)
  - `CADDYFILE` env var for docker-compose selection

- **CI/CD**
  - Test coverage enforcement with Istanbul provider (Bun-compatible)
  - Vitest upgraded to v4.0.17

### Fixed

- **Privacy**: Recurring transaction rules now scoped to individual users
- **Resilience**: API server starts in degraded mode when Valkey unavailable
- **Mobile UX**: Delete buttons visible on touch devices, larger color swatch targets
- **PWA**: Viewport meta tag, manifest.json, apple-touch-icon

## [0.2.0] - 2026-01-22

### Security

- **Security Remediation (P1-P5)**
  - Rate limiting with Redis + in-memory fallback for API and Server Actions
  - Input validation standardized with Zod schemas and length constraints
  - Error message sanitization to prevent enumeration attacks
  - WebSocket session revalidation (5-min interval) with logout propagation
  - Structured security event logging via `logSecurityEvent()`
  - Environment validation at startup (VALKEY_URL, DATABASE_URL)
  - CORS wildcard detection warning in production
  - VAPID key presence warning for push notifications

### Added

- **Account Recovery**
  - Restore deleted accounts with data reconnection
  - Fresh Start option: transfer data to owner, rejoin as member
  - 15-minute pending restore token in Valkey
  - Security audit logging for restore operations

- **Real-Time Sync**
  - WebSocket connection with exponential backoff reconnection
  - Valkey pub/sub for cross-instance broadcasting
  - Delta sync fetching only `updated_at > lastSyncTimestamp`
  - Ping/pong keepalive (30s interval)

- **Push Notifications**
  - Web Push with VAPID keys
  - 7-second batching window for grouped notifications
  - Smart message generation ("Added 3 items")
  - Actor filtering (skip sender)
  - Stale subscription cleanup (>7 days inactive)

- **Offline Support (PWA)**
  - Dexie (IndexedDB) for grocery storage
  - Sync queue with retry logic (max 5 attempts)
  - Conflict resolution: server-wins, local-wins, merge strategies
  - Service Worker for offline capability

- **Mobile UX**
  - Touch-optimized grocery list
  - Pull-to-refresh
  - Bottom navigation
  - Viewport meta tags for PWA

### Fixed

- Hardcoded URLs replaced with environment variables
- WebSocket hook ESLint error resolved
- Recurring transaction rules scoped to individual users

## [0.1.0] - 2026-01-01

### Added

- **Multi-Currency Support**
  - 5 currencies: CAD (default), USD, EUR, GBP, MXN
  - Exchange rate tracking per transaction
  - Home currency conversion display

- **Calendar Events**
  - Event CRUD with date/time
  - Household-scoped events

- **Recurring Transactions**
  - Rule-based transaction generation
  - Frequency options: daily, weekly, monthly, yearly
  - User-scoped rules (private to creator)

- **Budget Management**
  - Personal and shared budgets
  - Monthly spending tracking
  - Category-based allocation
  - Month-over-month comparison analytics

- **Assets & Debts Tracking**
  - Private asset tracking per user
  - Private debt tracking per user
  - Net worth calculation

- **Audit Logging**
  - PostgreSQL triggers for automatic change tracking
  - Old/new value capture (JSONB)
  - User attribution via session context
  - Record history queries

- **Grocery Tags**
  - Color-coded store labels
  - Tag creation with color picker
  - Tag editing and deletion
  - Duplicate prevention

- **Dashboard**
  - Overview page with key metrics
  - Budget summary
  - Recent transactions

- **Transaction Management**
  - Infinite scroll with Hono RPC
  - Category filtering
  - Date range selection

- **Member Management**
  - Role-based access: owner, admin, member
  - Role changes with permission checks
  - Member removal with data handling
  - Ownership transfer

- **Settings Page**
  - Household name editing
  - Theme preference (light/dark/system)
  - App info display

- **Dark Mode**
  - `next-themes` integration
  - System preference detection
  - CSS variables for theming

- **Authentik OIDC**
  - Replaced Authelia with Authentik
  - OIDC with PKCE flow
  - Session management in Valkey (7-day TTL)
  - Automatic user provisioning

### Infrastructure

- **Dev/Prod Hybrid Environment**
  - Production: `amigo.yourdomain.com`
  - Development: `dev-amigo.yourdomain.com`
  - Shared PostgreSQL with separate databases
  - Shared Valkey for sessions
  - Caddy reverse proxy with DNS-01 SSL

- **CI/CD**
  - Self-hosted GitHub Actions runner
  - Automated typecheck and tests
  - Docker build pipeline

## [0.0.1] - 2025-12-01

### Added

- Initial monorepo setup with Turborepo
- Next.js 15 with App Router
- Hono API server for WebSockets
- PostgreSQL 17 with Drizzle ORM
- Valkey 8 for sessions
- Basic grocery list CRUD
- Household data isolation
