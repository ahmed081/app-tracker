-- =====================================================================
-- Database user for the collector, with only the rights it needs.
--
-- Run as the database owner/admin, AFTER schema.sql:
--   psql "$ADMIN_DATABASE_URL" -v collector_password='a-strong-password' -f db/create-user.sql
--
-- What the collector CAN do:
--   * read everything
--   * add/update genres (genre sync), charts, archive readings and history
-- What it CANNOT do:
--   * change your configuration (country, tracking, tracking_country)
--   * delete anything
--   * create, alter or drop tables
-- =====================================================================

\set ON_ERROR_STOP on

-- Create the login, or reset its password if it already exists.
SELECT format('CREATE ROLE app_collector LOGIN PASSWORD %L', :'collector_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_collector')
\gexec
ALTER ROLE app_collector WITH LOGIN PASSWORD :'collector_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Connect to this database and use the public schema, without creating objects in it.
SELECT format('GRANT CONNECT ON DATABASE %I TO app_collector', current_database())
\gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_collector;

-- Read: every table and view.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_collector;

-- Configuration you control: read only (granted above).
--   country, tracking, tracking_country

-- Catalog kept in sync by the collector.
GRANT INSERT, UPDATE ON genre TO app_collector;
GRANT INSERT, UPDATE ON chart TO app_collector;

-- Archive and history: add, and update only where the code needs it
-- (failed slot replaced by a retry, last_seen_at, first_seen_at...).
GRANT INSERT, UPDATE ON raw_reading         TO app_collector;
GRANT INSERT, UPDATE ON snapshot            TO app_collector;
GRANT INSERT, UPDATE ON developer           TO app_collector;
GRANT INSERT, UPDATE ON app                 TO app_collector;
GRANT INSERT, UPDATE ON app_listing_version TO app_collector;
GRANT INSERT         ON ranking             TO app_collector;

-- Needed for the auto-generated id columns.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_collector;

-- Never allow deletes, even if granted elsewhere by mistake.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM app_collector;
