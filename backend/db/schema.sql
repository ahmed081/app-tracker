-- =====================================================================
-- Backend tables: app details (M4), ranking events (M5).
-- Needs the collector's schema.sql. Run as the database admin/owner, after
-- create-backend-user.sql:
--   psql "$ADMIN_DATABASE_URL" -f db/schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- M4: app details from Apple's Lookup API
-- ---------------------------------------------------------------------

-- Every Lookup API response, untouched (permanent archive).
CREATE TABLE raw_lookup (
    id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country_code   varchar(2)   NOT NULL REFERENCES country (code),
    collected_at   timestamptz  NOT NULL,
    url            text         NOT NULL,
    requested_ids  text         NOT NULL,            -- comma-separated Apple IDs
    http_status    integer,
    body           text,
    error          text,
    created_at     timestamptz  NOT NULL DEFAULT now()
);

-- When each app was last looked up in each country, and the outcome.
CREATE TABLE app_metadata_check (
    app_id           bigint       NOT NULL REFERENCES app (id),
    country_code     varchar(2)   NOT NULL REFERENCES country (code),
    status           text         NOT NULL CHECK (status IN ('OK', 'NOT_FOUND', 'ERROR')),
    last_checked_at  timestamptz  NOT NULL,
    last_ok_at       timestamptz,
    PRIMARY KEY (app_id, country_code)
);

-- App details per country. A new row only when something changes
-- (ratings are tracked separately in app_rating_daily).
CREATE TABLE app_metadata_version (
    id                    bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    app_id                bigint       NOT NULL REFERENCES app (id),
    country_code          varchar(2)   NOT NULL REFERENCES country (code),
    name                  text         NOT NULL,
    developer_name        text,
    seller_name           text,
    apple_developer_id    text,
    description           text,
    price                 numeric(12, 2),
    currency              text,
    formatted_price       text,
    age_rating            text,
    version               text,
    version_released_at   timestamptz,
    release_notes         text,
    released_at           timestamptz,
    size_bytes            bigint,
    minimum_os_version    text,
    languages             text,                        -- e.g. "EN,FIL"
    primary_genre_id      integer,
    primary_genre_name    text,
    genre_ids             text,                        -- e.g. "6014,7006"
    icon_url              text,
    screenshot_urls       jsonb        NOT NULL DEFAULT '[]',
    ipad_screenshot_urls  jsonb        NOT NULL DEFAULT '[]',
    website_url           text,
    store_url             text,
    content_hash          text         NOT NULL,
    first_seen_at         timestamptz  NOT NULL,
    last_seen_at          timestamptz  NOT NULL,
    created_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX app_metadata_latest_idx ON app_metadata_version (app_id, country_code, first_seen_at DESC);

-- Ratings over time: one row per app, country and day (latest value of the day).
CREATE TABLE app_rating_daily (
    app_id                       bigint        NOT NULL REFERENCES app (id),
    country_code                 varchar(2)    NOT NULL REFERENCES country (code),
    day                          date          NOT NULL,
    rating                       numeric(4, 3),
    rating_count                 integer,
    rating_current_version       numeric(4, 3),
    rating_count_current_version integer,
    updated_at                   timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (app_id, country_code, day)
);

-- ---------------------------------------------------------------------
-- M5: ranking events (derived; rebuildable from snapshots at any time)
-- ---------------------------------------------------------------------

-- Set when the event engine has processed a VALID snapshot.
ALTER TABLE snapshot ADD COLUMN processed_at timestamptz;
CREATE INDEX snapshot_pending_idx ON snapshot (chart_id, slot_start)
    WHERE status = 'VALID' AND processed_at IS NULL;

-- Where each app stands in each chart right now.
CREATE TABLE app_chart_state (
    chart_id            bigint       NOT NULL REFERENCES chart (id),
    app_id              bigint       NOT NULL REFERENCES app (id),
    current_rank        integer,                       -- null = below collected depth
    in_chart            boolean      NOT NULL,         -- rank <= display depth (Top 25)
    ever_in_chart       boolean      NOT NULL,
    in_chart_since      timestamptz,                   -- start of current Top 25 streak
    best_rank           integer,
    best_rank_at        timestamptz,
    worst_rank          integer,
    first_observed_at   timestamptz  NOT NULL,
    last_seen_at        timestamptz,
    recent_ranks        text         NOT NULL DEFAULT '', -- last ranks, oldest first; "-" = absent
    rising              boolean      NOT NULL DEFAULT false,
    last_snapshot_id    bigint       NOT NULL REFERENCES snapshot (id),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (chart_id, app_id)
);

CREATE INDEX app_chart_state_app_idx ON app_chart_state (app_id);

-- What happened, when.
--   importance: 0 none, 1 low, 2 medium, 3 high
CREATE TABLE chart_event (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chart_id         bigint       NOT NULL REFERENCES chart (id),
    app_id           bigint       NOT NULL REFERENCES app (id),
    snapshot_id      bigint       NOT NULL REFERENCES snapshot (id),
    event_type       text         NOT NULL,
    tier             integer,                         -- for ENTERED_TOP_N / LEFT_TOP_N
    previous_rank    integer,
    current_rank     integer,
    occurred_at      timestamptz  NOT NULL,           -- snapshot slot, never processing time
    covered_minutes  integer,                         -- time since the previous VALID snapshot
    gap              boolean      NOT NULL DEFAULT false,
    importance       smallint     NOT NULL,
    is_primary       boolean      NOT NULL DEFAULT false,
    notified         boolean      NOT NULL DEFAULT false,
    created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX chart_event_chart_time_idx ON chart_event (chart_id, occurred_at DESC);
CREATE INDEX chart_event_app_time_idx   ON chart_event (app_id, occurred_at DESC);
CREATE INDEX chart_event_snapshot_idx   ON chart_event (snapshot_id);
CREATE INDEX chart_event_unnotified_idx ON chart_event (id) WHERE notified = false AND importance >= 2;

-- Periods an app spent in each tier (1, 5, 10, 25).
CREATE TABLE tier_interval (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chart_id    bigint       NOT NULL REFERENCES chart (id),
    app_id      bigint       NOT NULL REFERENCES app (id),
    tier        integer      NOT NULL,
    started_at  timestamptz  NOT NULL,
    ended_at    timestamptz,                          -- null = still in the tier
    uncertain   boolean      NOT NULL DEFAULT false   -- spans a gap in the data
);

CREATE INDEX tier_interval_app_idx  ON tier_interval (app_id, chart_id, tier, started_at);
CREATE UNIQUE INDEX tier_interval_open_idx ON tier_interval (chart_id, app_id, tier) WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------
-- Read helpers: the latest listing, details and rating of each app per country
-- ---------------------------------------------------------------------
CREATE VIEW v_app_listing_latest AS
SELECT DISTINCT ON (app_id, country_code) *
FROM app_listing_version
ORDER BY app_id, country_code, first_seen_at DESC, id DESC;

CREATE VIEW v_app_metadata_latest AS
SELECT DISTINCT ON (app_id, country_code) *
FROM app_metadata_version
ORDER BY app_id, country_code, first_seen_at DESC, id DESC;

CREATE VIEW v_app_rating_latest AS
SELECT DISTINCT ON (app_id, country_code) *
FROM app_rating_daily
ORDER BY app_id, country_code, day DESC;

-- ---------------------------------------------------------------------
-- Backend database user: read everything, write only its own tables.
-- The login and password are set by db/create-backend-user.sql.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
        CREATE ROLE app_backend NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_backend;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_backend;
GRANT INSERT ON raw_lookup TO app_backend;
GRANT INSERT, UPDATE ON app_metadata_check, app_metadata_version, app_rating_daily TO app_backend;
GRANT INSERT, UPDATE, DELETE ON app_chart_state, chart_event, tier_interval TO app_backend;
GRANT UPDATE (processed_at) ON snapshot TO app_backend;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_backend;
