-- =====================================================================
-- Example configuration: track every Games category, Top Free, in the
-- United States. The same can be done from the web app's Settings menu.
-- Run as the database admin/owner (the collector cannot change configuration):
--   psql "$ADMIN_DATABASE_URL" -f db/activate-us.sql
--
-- Safe to run more than once. Nothing is deleted; switch things off to stop.
-- Run `npm run sync-genres` first so every Games category exists.
-- The collector picks the change up within a minute.
-- =====================================================================

BEGIN;

-- The storefront.
INSERT INTO country (code, name, enabled) VALUES ('us', 'United States', true)
ON CONFLICT (code) DO UPDATE SET enabled = true, updated_at = now();

-- Every Games subcategory Apple still lists.
UPDATE genre SET enabled = true, updated_at = now()
WHERE parent_id = 6014 AND available_on_apple AND NOT enabled;

-- One tracking row per category (Top Free), switched on.
INSERT INTO tracking (genre_id, chart_type)
SELECT id, 'TOP_FREE' FROM genre WHERE parent_id = 6014 AND available_on_apple
ON CONFLICT (genre_id, chart_type) DO UPDATE SET active = true, updated_at = now();

-- In the United States (rows that already track every country need nothing).
INSERT INTO tracking_country (tracking_id, country_code, active)
SELECT t.id, 'us', true
FROM tracking t
JOIN genre g ON g.id = t.genre_id
WHERE g.parent_id = 6014 AND t.chart_type = 'TOP_FREE' AND NOT t.all_countries
ON CONFLICT (tracking_id, country_code) DO UPDATE SET active = true;

COMMIT;

-- What will be collected:
SELECT country_code, genre_id, chart_type FROM v_tracking_target WHERE country_code = 'us' ORDER BY genre_id;
