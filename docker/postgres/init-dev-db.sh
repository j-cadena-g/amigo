#!/bin/bash
set -e

# Create the dev database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE ${POSTGRES_DB}_dev'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${POSTGRES_DB}_dev')\gexec
EOSQL

echo "Dev database ${POSTGRES_DB}_dev created (or already exists)"
