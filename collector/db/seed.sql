-- Starting configuration. Safe to run more than once.
BEGIN;

-- Countries: Philippines enabled, the rest available but disabled.
INSERT INTO country (code, name, enabled) VALUES
    ('ph', 'Philippines',    true),
    ('us', 'United States',  false),
    ('gb', 'United Kingdom', false),
    ('ca', 'Canada',         false),
    ('au', 'Australia',      false),
    ('id', 'Indonesia',      false),
    ('my', 'Malaysia',       false),
    ('sg', 'Singapore',      false),
    ('th', 'Thailand',       false),
    ('vn', 'Vietnam',        false),
    ('in', 'India',          false),
    ('fr', 'France',         false),
    ('de', 'Germany',        false),
    ('br', 'Brazil',         false),
    ('mx', 'Mexico',         false)
ON CONFLICT (code) DO NOTHING;

-- Minimal genre tree so tracking works before the first genre sync.
-- The sync (`npm run sync-genres`) fills in all other genres, disabled.
INSERT INTO genre (id, name, parent_id, enabled) VALUES
    (36,   'App Store', NULL, false),
    (6014, 'Games',     36,   false),
    (7004, 'Board',     6014, true),
    (7005, 'Card',      6014, true),
    (7006, 'Casino',    6014, true)
ON CONFLICT (id) DO NOTHING;

-- What to track: Board, Card and Casino, Top Free.
INSERT INTO tracking (genre_id, chart_type, depth, interval_minutes, all_countries) VALUES
    (7004, 'TOP_FREE', 200, 720, false),
    (7005, 'TOP_FREE', 200, 720, false),
    (7006, 'TOP_FREE', 200, 720, false)
ON CONFLICT (genre_id, chart_type) DO NOTHING;

-- Where: the Philippines.
INSERT INTO tracking_country (tracking_id, country_code)
SELECT t.id, 'ph'
FROM tracking t
WHERE t.genre_id IN (7004, 7005, 7006) AND t.chart_type = 'TOP_FREE'
ON CONFLICT DO NOTHING;

COMMIT;
