-- =====================================================================
-- Milestone 9: the watchlist and its alert rules. Needs db/schema.sql.
-- Run as the database admin/owner; safe to run more than once:
--   psql "$ADMIN_DATABASE_URL" -f db/watchlist.sql
--
-- One shared watchlist (user_id is always NULL until there are accounts).
-- app_backend can follow, unfollow and change rules, but never delete:
-- unfollowing switches the watch off (active = false).
-- =====================================================================

BEGIN;

-- What is followed.
--   APP   : an app in one chart (chart_id set) or in every chart it appears in (chart_id NULL)
--   CHART : a chart's big moments (a new #1, entries into the highest tier)
CREATE TABLE IF NOT EXISTS watch (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint,                                -- always NULL for now; room for future accounts
    kind        text         NOT NULL CHECK (kind IN ('APP', 'CHART')),
    app_id      bigint       REFERENCES app (id),
    chart_id    bigint       REFERENCES chart (id),
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT watch_target_check CHECK ((kind = 'APP' AND app_id IS NOT NULL)
        OR (kind = 'CHART' AND app_id IS NULL AND chart_id IS NOT NULL)),
    CONSTRAINT watch_unique UNIQUE NULLS NOT DISTINCT (user_id, kind, app_id, chart_id)
);

CREATE INDEX IF NOT EXISTS watch_active_kind_idx ON watch (active, kind);
CREATE INDEX IF NOT EXISTS watch_app_idx ON watch (app_id) WHERE active;

-- The alert rule of an app watch (chart watches use their fixed big moments).
-- event_types, min_places and tiers are used by CUSTOM only; tiers NULL = every configured tier.
CREATE TABLE IF NOT EXISTS alert_rule (
    watch_id     bigint       PRIMARY KEY REFERENCES watch (id),
    preset       text         NOT NULL DEFAULT 'IMPORTANT' CHECK (preset IN ('IMPORTANT', 'ALL', 'CUSTOM')),
    event_types  text[],
    min_places   integer      CHECK (min_places BETWEEN 1 AND 200),
    tiers        integer[],
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT alert_rule_custom_check CHECK (preset = 'CUSTOM'
        OR (event_types IS NULL AND min_places IS NULL AND tiers IS NULL))
);

GRANT SELECT, INSERT, UPDATE ON watch, alert_rule TO app_backend;
GRANT USAGE ON SEQUENCE watch_id_seq TO app_backend;
REVOKE DELETE, TRUNCATE ON watch, alert_rule FROM app_backend;

-- The collector reads everything, like every other table.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_collector') THEN
        GRANT SELECT ON watch, alert_rule TO app_collector;
    END IF;
END
$$;

COMMIT;
