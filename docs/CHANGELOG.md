# Changelog

All notable changes to this project will be documented in this file.

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
  - Production: `amigo.cadenalabs.net`
  - Development: `dev-amigo.cadenalabs.net`
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
