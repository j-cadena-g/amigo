### Technical Debt and Architectural Weaknesses - amigo v0.2.0

Please review and propose fixes for the following weaknesses identified in the current codebase:

#### 1. Infrastructure & Scaling
* **Single Point of Failure:** The application is currently deployed on a single Proxmox VM (Docker + Tailscale), creating a risk where hardware or VM failure results in total downtime.
* **Environment Contention:** Production and development stacks share the same host, meaning a resource-heavy dev process can impact the production user experience.
* ~~**Manual Disaster Recovery:** The current recovery plan relies on manual execution of `pg_dump` and `docker compose` commands rather than automated failover or point-in-time recovery (PITR).~~
  * **FIXED:** Automated backup script (`scripts/backup.sh`) with 7-day rotation, cron schedule templates, and Makefile targets (`db-backup`, `db-backup-list`, `db-restore`).

#### 2. Monitoring & Observability
* **Basic Health Monitoring:** Health checks are limited to a simple `/health` endpoint check via a Bash script, lacking granular metrics like request latency, CPU/memory usage, or structured alerting.
* **Lack of Centralized Logging:** While structured JSON logging is implemented via Pino, there is no centralized log aggregation (e.g., ELK or Grafana Loki) to debug issues across the Web and API containers.

#### 3. Security & Identity
* **Wildcard Domain Trust:** The session cookie is scoped to the parent domain `.cadenalabs.net` to enable SSO, which requires all subdomains on that domain to be fully trusted and equally secure.
* ~~**Critical Cache Dependency:** The API server fails at startup if `VALKEY_URL` is missing, making the entire platform's availability strictly dependent on the cache layer for core session and WebSocket functionality.~~
  * **FIXED:** API server now starts in degraded mode when Valkey is unavailable. WebSocket connections return 503, rate limiting falls back to in-memory, and health endpoint reports degraded status. Server remains functional for basic API operations.

#### 4. Data Integrity & UX
* **Primitive Offline Conflict Resolution:** The current offline sync uses "server-wins" or "local-wins" strategies, which can lead to data loss in collaborative household environments.
* ~~**Manual Audit Retention:** Although a 90-day retention policy is defined for the `audit_logs` table, there is no automated background worker or cron job currently implemented to prune these partitions.~~
  * **FIXED:** Audit retention script (`scripts/audit-retention.sh`) with configurable retention period (default 90 days), batch deletion to avoid locks, cron schedule templates, and Makefile targets (`audit-stats`, `audit-prune`, `audit-prune-dry`).
* **Hardware Integration Gaps:** The mobile UX lacks integration for high-value budgeting features like receipt scanning via camera or barcode scanning for grocery items.

#### 5. Testing & Maintenance
* ~~**Incomplete CI/CD Gating:** The pipeline focuses on linting and type-checking but lacks automated test coverage enforcement to prevent merges with low coverage.~~
  * **FIXED:** CI now runs `test:coverage` instead of `test`. Vitest configured with coverage thresholds (statements: 25%, branches: 35%, functions: 25%, lines: 25%). Thresholds should be increased incrementally as more tests are added.
* ~~**Proxy Configuration Complexity:** Dev and production routing are handled in a single Caddyfile, increasing the risk of accidental production misconfiguration during development changes.~~
  * **FIXED:** Split into separate `Caddyfile.prod` and `Caddyfile.dev` files. Docker compose now supports `CADDYFILE` environment variable to select configuration. Makefile targets (`caddy-prod`, `caddy-dev`, `caddy-reload`) for easy switching.

---

## Summary of Fixes (v0.2.1)

| Issue | Status | Implementation |
|-------|--------|----------------|
| Manual Disaster Recovery | ✅ Fixed | `scripts/backup.sh`, cron templates, Makefile targets |
| Critical Cache Dependency | ✅ Fixed | Graceful degradation in `redis.ts`, degraded mode support |
| Manual Audit Retention | ✅ Fixed | `scripts/audit-retention.sh`, cron templates, Makefile targets |
| Incomplete CI/CD Gating | ✅ Fixed | Coverage thresholds in vitest, `test:coverage` in CI |
| Proxy Configuration Complexity | ✅ Fixed | Split Caddyfiles, CADDYFILE env var, Makefile targets |

### Remaining Items (Not Addressed)
- Single Point of Failure (requires infrastructure changes)
- Environment Contention (requires infrastructure changes)
- Basic Health Monitoring (consider Prometheus/Grafana)
- Lack of Centralized Logging (consider Loki/ELK)
- Wildcard Domain Trust (acceptable if all subdomains are controlled)
- Primitive Offline Conflict Resolution (consider CRDTs)
- Hardware Integration Gaps (feature request, not debt)
