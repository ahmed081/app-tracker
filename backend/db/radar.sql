-- =====================================================================
-- Milestone 10: the Radar's known themes and dismissed apps. Needs db/schema.sql.
-- Run as the database admin/owner, after management.sql; safe to run more
-- than once:
--   psql "$ADMIN_DATABASE_URL" -f db/radar.sql
--
-- Everything else the Radar shows is computed at read time from existing data.
-- app_backend can add and change themes and dismissals, but never delete:
-- themes are switched off, "undismiss" sets active = false.
-- =====================================================================

BEGIN;

-- Known niches. An app whose name or subtitle contains a keyword has a known theme;
-- the theme's words are left out of "Emerging words" when "Hide known themes" is on.
CREATE TABLE IF NOT EXISTS radar_theme (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text         NOT NULL UNIQUE,
    keywords    text[]       NOT NULL,
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Apps hidden from the Radar (active = true) until undismissed.
CREATE TABLE IF NOT EXISTS radar_dismissal (
    app_id      bigint       PRIMARY KEY REFERENCES app (id),
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Seed themes. Existing rows (possibly edited or switched off) are left alone.
INSERT INTO radar_theme (name, keywords) VALUES
    ('Tongits',    '{tongits}'),
    ('Pusoy',      '{pusoy,"pusoy dos"}'),
    ('Slots',      '{slot,slots}'),
    ('Bingo',      '{bingo}'),
    ('Poker',      '{poker,texas,holdem}'),
    ('Mahjong',    '{mahjong}'),
    ('Sabong',     '{sabong}'),
    ('Ludo',       '{ludo}'),
    ('Domino',     '{domino,dominoes}'),
    ('Chess',      '{chess}'),
    ('Solitaire',  '{solitaire}'),
    ('Lucky 9',    '{"lucky 9","lucky nine"}'),
    ('Sakla',      '{sakla}'),
    ('Color game', '{"color game",perya}')
ON CONFLICT (name) DO NOTHING;

-- The least-privilege logins, when the database has them. With a single owner
-- login (no app_backend role) the owner already has every right it needs.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
        GRANT SELECT, INSERT, UPDATE ON radar_theme, radar_dismissal TO app_backend;
        GRANT USAGE ON SEQUENCE radar_theme_id_seq TO app_backend;
        REVOKE DELETE, TRUNCATE ON radar_theme, radar_dismissal FROM app_backend;
    ELSE
        RAISE NOTICE 'No app_backend role: no grants needed, the owner runs the backend';
    END IF;
    -- The collector reads everything, like every other table.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_collector') THEN
        GRANT SELECT ON radar_theme, radar_dismissal TO app_collector;
    END IF;
END
$$;

COMMIT;
