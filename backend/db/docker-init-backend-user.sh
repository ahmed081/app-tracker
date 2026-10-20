#!/bin/sh
# Run by the postgres container on its FIRST start: creates the backend's login.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v backend_password="$BACKEND_PASSWORD" \
     -f /db/create-backend-user.sql
