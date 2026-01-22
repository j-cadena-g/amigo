#!/bin/bash
# =============================================================================
# PostgreSQL Backup Script with Rotation
# =============================================================================
# Performs automated backups of PostgreSQL databases with configurable retention.
# Supports both scheduled (cron) and manual execution.
#
# Usage:
#   ./scripts/backup.sh                    # Backup all databases
#   ./scripts/backup.sh --db amigo         # Backup specific database
#   ./scripts/backup.sh --list             # List available backups
#   ./scripts/backup.sh --restore <file>   # Restore from backup
#
# Environment variables (from .env):
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#   BACKUP_RETENTION_DAYS (default: 7)
#   BACKUP_DIR (default: ./backups)
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
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
CONTAINER_NAME="amigo-postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check if postgres container is running
check_postgres() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "PostgreSQL container '${CONTAINER_NAME}' is not running"
        exit 1
    fi
}

# Backup a single database
backup_database() {
    local db_name=$1
    local backup_file="${BACKUP_DIR}/${db_name}_${TIMESTAMP}.sql.gz"

    log_info "Backing up database: ${db_name}"

    if docker exec "$CONTAINER_NAME" pg_dump \
        -U "${POSTGRES_USER}" \
        --format=custom \
        --compress=6 \
        "${db_name}" > "${backup_file%.gz}.dump" 2>/dev/null; then

        # Compress with gzip for additional compression
        gzip -f "${backup_file%.gz}.dump"
        mv "${backup_file%.gz}.dump.gz" "$backup_file"

        local size
        size=$(du -h "$backup_file" | cut -f1)
        log_info "Created backup: ${backup_file} (${size})"
        echo "$backup_file"
    else
        log_error "Failed to backup database: ${db_name}"
        return 1
    fi
}

# Backup all amigo databases
backup_all() {
    check_postgres

    local databases=("${POSTGRES_DB}" "${POSTGRES_DB}_dev")
    local success=0
    local failed=0

    log_info "Starting backup of all databases..."

    for db in "${databases[@]}"; do
        # Check if database exists
        if docker exec "$CONTAINER_NAME" psql -U "${POSTGRES_USER}" -lqt | cut -d \| -f 1 | grep -qw "$db"; then
            if backup_database "$db"; then
                ((success++))
            else
                ((failed++))
            fi
        else
            log_warn "Database '${db}' does not exist, skipping"
        fi
    done

    log_info "Backup complete: ${success} succeeded, ${failed} failed"

    # Cleanup old backups
    cleanup_old_backups

    return $failed
}

# Cleanup backups older than retention period
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."

    local count
    count=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +"$RETENTION_DAYS" | wc -l)

    if [[ $count -gt 0 ]]; then
        find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
        log_info "Removed ${count} old backup(s)"
    else
        log_info "No old backups to remove"
    fi
}

# List available backups
list_backups() {
    log_info "Available backups in ${BACKUP_DIR}:"
    echo ""

    if [[ -d "$BACKUP_DIR" ]] && ls "$BACKUP_DIR"/*.sql.gz 1> /dev/null 2>&1; then
        printf "%-45s %10s %s\n" "FILENAME" "SIZE" "DATE"
        printf "%-45s %10s %s\n" "--------" "----" "----"

        for file in "$BACKUP_DIR"/*.sql.gz; do
            local filename size date
            filename=$(basename "$file")
            size=$(du -h "$file" | cut -f1)
            date=$(stat -c %y "$file" | cut -d' ' -f1)
            printf "%-45s %10s %s\n" "$filename" "$size" "$date"
        done
    else
        log_warn "No backups found"
    fi
}

# Restore from backup
restore_backup() {
    local backup_file=$1

    if [[ ! -f "$backup_file" ]]; then
        # Try prepending backup directory
        backup_file="${BACKUP_DIR}/${backup_file}"
    fi

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: ${backup_file}"
        exit 1
    fi

    # Extract database name from filename
    local db_name
    db_name=$(basename "$backup_file" | sed 's/_[0-9]\{8\}_[0-9]\{6\}\.sql\.gz$//')

    log_warn "This will OVERWRITE the database '${db_name}'"
    read -p "Are you sure you want to continue? (yes/no): " confirm

    if [[ "$confirm" != "yes" ]]; then
        log_info "Restore cancelled"
        exit 0
    fi

    check_postgres

    log_info "Restoring database '${db_name}' from ${backup_file}..."

    # Decompress and restore
    gunzip -c "$backup_file" | docker exec -i "$CONTAINER_NAME" pg_restore \
        -U "${POSTGRES_USER}" \
        -d "${db_name}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges

    log_info "Restore complete"
}

# Show usage
usage() {
    cat << EOF
PostgreSQL Backup Script for Amigo

Usage:
    $0                          Backup all databases
    $0 --db <name>              Backup specific database
    $0 --list                   List available backups
    $0 --restore <file>         Restore from backup file
    $0 --cleanup                Remove old backups only
    $0 --help                   Show this help message

Environment:
    BACKUP_RETENTION_DAYS       Days to keep backups (default: 7)
    BACKUP_DIR                  Backup directory (default: ./backups)

Examples:
    $0                          # Full backup
    $0 --db amigo               # Backup production DB only
    $0 --restore amigo_20240115_120000.sql.gz
EOF
}

# Parse arguments
case "${1:-}" in
    --db)
        check_postgres
        backup_database "${2:-${POSTGRES_DB}}"
        ;;
    --list)
        list_backups
        ;;
    --restore)
        if [[ -z "${2:-}" ]]; then
            log_error "Please specify a backup file to restore"
            exit 1
        fi
        restore_backup "$2"
        ;;
    --cleanup)
        cleanup_old_backups
        ;;
    --help|-h)
        usage
        ;;
    "")
        backup_all
        ;;
    *)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
esac
