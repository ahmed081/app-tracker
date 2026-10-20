-- =====================================================================
-- Login for the backend (app_backend). Run as the database admin BEFORE the
-- backend's first start. The backend's schema (db/schema.sql, run as admin)
-- then grants the rights below:
--   psql "$ADMIN_DATABASE_URL" -v backend_password='a-strong-password' -f db/create-backend-user.sql
--
-- app_backend can read everything and write only the backend's own tables:
-- app details, ratings, events, app chart state, tier intervals, and the
-- snapshot.processed_at marker. It cannot change configuration, rankings or
-- the collector's history, and cannot create or drop tables.
-- =====================================================================

\set ON_ERROR_STOP on

SELECT 'CREATE ROLE app_backend NOLOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend')
\gexec

ALTER ROLE app_backend WITH LOGIN PASSWORD :'backend_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('GRANT CONNECT ON DATABASE %I TO app_backend', current_database())
\gexec
