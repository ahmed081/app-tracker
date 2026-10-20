#!/bin/sh
# Run by the postgres container on its FIRST start, after schema and seed.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v collector_password="$COLLECTOR_PASSWORD" \
     -f /db/create-user.sql
