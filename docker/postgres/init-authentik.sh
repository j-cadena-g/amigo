#!/bin/bash
set -e

# Create the authentik database and user if they don't exist
# Uses AUTHENTIK_DB_PASSWORD from environment (defaults to 'authentik')

AUTHENTIK_PASSWORD="${AUTHENTIK_DB_PASSWORD:-authentik}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create authentik user if it doesn't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authentik') THEN
            CREATE USER authentik WITH PASSWORD '$AUTHENTIK_PASSWORD';
        END IF;
    END
    \$\$;

    -- Create authentik database if it doesn't exist
    SELECT 'CREATE DATABASE authentik OWNER authentik'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'authentik')\gexec

    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE authentik TO authentik;
EOSQL

echo "Authentik database and user created (or already exist)"
