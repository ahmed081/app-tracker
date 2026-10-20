-- =====================================================================
-- Settings menu: runtime-editable values and the configuration rights the
-- backend needs. Needs db/schema.sql. Run as the database admin/owner;
-- safe to run more than once:
--   psql "$ADMIN_DATABASE_URL" -f db/management.sql
--
-- app_backend can then add countries, tracking and tracking countries, and
-- switch things on and off. It still cannot delete configuration:
-- "remove" means "switch off".
-- =====================================================================

BEGIN;

-- Runtime-editable values. A missing row means the application.yml defaults apply.
--   event_rules : JSON overrides of apptracker.events (tiers, big move, rising, new best)
CREATE TABLE IF NOT EXISTS setting (
    key         text         PRIMARY KEY,
    value       jsonb        NOT NULL,
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON setting TO app_backend;

-- Configuration: add rows, and change only the switches and tuning columns.
GRANT INSERT ON country, tracking, tracking_country TO app_backend;
GRANT UPDATE (name, enabled, updated_at) ON country TO app_backend;
GRANT UPDATE (enabled, updated_at) ON genre TO app_backend;
GRANT UPDATE (depth, interval_minutes, all_countries, active, updated_at) ON tracking TO app_backend;
GRANT UPDATE (active) ON tracking_country TO app_backend;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_backend;

-- Never allow deleting configuration or history.
REVOKE DELETE, TRUNCATE ON country, genre, tracking, tracking_country, chart FROM app_backend;

COMMIT;
