#!/bin/bash
# =============================================================================
# Audit Log Retention Script
# =============================================================================
# Prunes audit logs older than the configured retention period.
# Default retention: 90 days
#
# Usage:
#   ./scripts/audit-retention.sh              # Prune logs older than 90 days
#   ./scripts/audit-retention.sh --days 30    # Prune logs older than 30 days
#   ./scripts/audit-retention.sh --dry-run    # Show what would be deleted
#   ./scripts/audit-retention.sh --count      # Count logs by age
#
# Environment variables (from .env):
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#   AUDIT_RETENTION_DAYS (default: 90)
# =============================================================================

set -euo pipefail

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ -f "$PROJECT_ROOT/.env" ]]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env"
fi

# Configuration with defaults
RETENTION_DAYS="${AUDIT_RETENTION_DAYS:-90}"
CONTAINER_NAME="amigo-postgres"
DRY_RUN=false
COUNT_ONLY=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_dry() { echo -e "${BLUE}[DRY-RUN]${NC} $1"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --days)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --count)
            COUNT_ONLY=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --days N      Retention period in days (default: 90)"
            echo "  --dry-run     Show what would be deleted without deleting"
            echo "  --count       Show count of logs by age group"
            echo "  --help        Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if postgres container is running
check_postgres() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "PostgreSQL container '${CONTAINER_NAME}' is not running"
        exit 1
    fi
}

# Execute SQL query
run_sql() {
    local query="$1"
    docker exec "$CONTAINER_NAME" psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t \
        -c "$query"
}

# Count logs by age group
count_logs() {
    log_info "Audit log statistics for database: ${POSTGRES_DB}"
    echo ""

    # Total count
    local total
    total=$(run_sql "SELECT COUNT(*) FROM audit_logs;" | tr -d ' ')
    echo "Total audit logs: $total"
    echo ""

    # Count by age groups
    echo "Distribution by age:"
    echo "-------------------"

    local last_7
    last_7=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days';" | tr -d ' ')
    echo "  Last 7 days:   $last_7"

    local last_30
    last_30=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '30 days' AND created_at <= NOW() - INTERVAL '7 days';" | tr -d ' ')
    echo "  8-30 days:     $last_30"

    local last_90
    last_90=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '90 days' AND created_at <= NOW() - INTERVAL '30 days';" | tr -d ' ')
    echo "  31-90 days:    $last_90"

    local older_90
    older_90=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at <= NOW() - INTERVAL '90 days';" | tr -d ' ')
    echo "  Older than 90: $older_90"
    echo ""

    # Would be deleted with current retention
    local would_delete
    would_delete=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days';" | tr -d ' ')
    echo "With ${RETENTION_DAYS}-day retention: $would_delete logs would be pruned"
}

# Prune old logs
prune_logs() {
    local cutoff_date
    cutoff_date=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d)

    log_info "Pruning audit logs older than ${RETENTION_DAYS} days (before ${cutoff_date})..."

    # Count logs to delete
    local count
    count=$(run_sql "SELECT COUNT(*) FROM audit_logs WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days';" | tr -d ' ')

    if [[ "$count" -eq 0 ]]; then
        log_info "No audit logs to prune"
        return 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would delete ${count} audit log entries"
        log_dry "Oldest entry date:"
        run_sql "SELECT MIN(created_at)::date FROM audit_logs;"
        return 0
    fi

    # Delete in batches to avoid long locks
    local batch_size=10000
    local deleted=0

    log_info "Deleting ${count} logs in batches of ${batch_size}..."

    while [[ "$deleted" -lt "$count" ]]; do
        local batch_deleted
        batch_deleted=$(run_sql "
            WITH deleted AS (
                DELETE FROM audit_logs
                WHERE id IN (
                    SELECT id FROM audit_logs
                    WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
                    LIMIT ${batch_size}
                )
                RETURNING id
            )
            SELECT COUNT(*) FROM deleted;
        " | tr -d ' ')

        deleted=$((deleted + batch_deleted))

        if [[ "$batch_deleted" -eq 0 ]]; then
            break
        fi

        echo -ne "\r  Deleted: ${deleted}/${count}"
    done

    echo ""
    log_info "Pruning complete: ${deleted} audit logs removed"

    # Optionally vacuum the table to reclaim space
    log_info "Running VACUUM on audit_logs table..."
    run_sql "VACUUM ANALYZE audit_logs;"
    log_info "Vacuum complete"
}

# Main execution
check_postgres

if [[ "$COUNT_ONLY" == true ]]; then
    count_logs
else
    prune_logs
fi
