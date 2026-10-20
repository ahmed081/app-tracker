-- =====================================================================
-- App Store Ranking Tracker — PostgreSQL schema
-- =====================================================================
-- Three groups of tables:
--   1. Configuration  : country, genre, tracking, tracking_country, chart
--   2. Archive        : raw_reading (Apple's responses, untouched)
--   3. History        : snapshot, developer, app, app_listing_version, ranking
--
-- Rules:
--   * History is never updated or deleted, only added to.
--   * raw_reading is the permanent archive; every history table can be
--     rebuilt from it.
--   * Switching configuration off never deletes data: charts become inactive.
--   * All timestamps are timestamptz and handled in UTC.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. CONFIGURATION
-- ---------------------------------------------------------------------

-- Storefronts. `enabled` is your switch.
CREATE TABLE country (
    code        varchar(2)   PRIMARY KEY CHECK (code = lower(code)),
    name        text         NOT NULL,
    enabled     boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Apple categories, loaded from Apple's genre tree.
--   enabled            : your switch (new genres arrive disabled)
--   available_on_apple : set by the genre sync, never by you
CREATE TABLE genre (
    id                  integer      PRIMARY KEY,          -- Apple genre ID, e.g. 7006
    name                text         NOT NULL,
    parent_id           integer      REFERENCES genre (id),
    enabled             boolean      NOT NULL DEFAULT false,
    available_on_apple  boolean      NOT NULL DEFAULT true,
    synced_at           timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX genre_parent_idx ON genre (parent_id);

-- WHAT to track: one row per category + chart type.
CREATE TABLE tracking (
    id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    genre_id          integer      NOT NULL REFERENCES genre (id),
    chart_type        text         NOT NULL
                      CHECK (chart_type IN ('TOP_FREE', 'TOP_PAID', 'TOP_GROSSING')),
    depth             integer      NOT NULL DEFAULT 200 CHECK (depth BETWEEN 1 AND 200),
    interval_minutes  integer      NOT NULL DEFAULT 720 CHECK (interval_minutes BETWEEN 5 AND 1440),
    all_countries     boolean      NOT NULL DEFAULT false,
    active            boolean      NOT NULL DEFAULT true,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (genre_id, chart_type)
);

-- WHERE to track it (ignored when tracking.all_countries = true).
CREATE TABLE tracking_country (
    tracking_id   bigint       NOT NULL REFERENCES tracking (id),
    country_code  varchar(2)   NOT NULL REFERENCES country (code),
    active        boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (tracking_id, country_code)
);

-- One row per real chart (country + genre + type).
-- Generated from tracking; never edited by hand. History attaches here.
CREATE TABLE chart (
    id                      bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country_code            varchar(2)   NOT NULL REFERENCES country (code),
    genre_id                integer      NOT NULL REFERENCES genre (id),
    chart_type              text         NOT NULL
                            CHECK (chart_type IN ('TOP_FREE', 'TOP_PAID', 'TOP_GROSSING')),
    depth                   integer      NOT NULL,   -- copied from tracking at sync time
    interval_minutes        integer      NOT NULL,   -- copied from tracking at sync time
    active                  boolean      NOT NULL DEFAULT true,
    last_attempt_at         timestamptz,
    last_valid_snapshot_at  timestamptz,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (country_code, genre_id, chart_type)
);

-- Every chart that SHOULD be collected right now, after applying every switch:
-- tracking.active, tracking_country.active (or all_countries),
-- country.enabled, genre.enabled and genre.available_on_apple.
CREATE VIEW v_tracking_target AS
SELECT t.id AS tracking_id,
       c.code AS country_code,
       t.genre_id,
       t.chart_type,
       t.depth,
       t.interval_minutes
FROM tracking t
JOIN genre g    ON g.id = t.genre_id
JOIN country c  ON c.enabled
LEFT JOIN tracking_country tc
       ON tc.tracking_id = t.id
      AND tc.country_code = c.code
WHERE t.active
  AND g.enabled
  AND g.available_on_apple
  AND (t.all_countries OR tc.active IS TRUE);

-- ---------------------------------------------------------------------
-- 2. ARCHIVE
-- ---------------------------------------------------------------------

-- Apple's response for one chart and one time slot, stored as received.
-- The only allowed update: a failed attempt replaced by a later success
-- for the same slot.
CREATE TABLE raw_reading (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chart_id         bigint       NOT NULL REFERENCES chart (id),
    slot_start       timestamptz  NOT NULL,          -- e.g. 2026-10-19 10:00:00Z
    collected_at     timestamptz  NOT NULL,          -- actual fetch time
    source           text         NOT NULL,          -- e.g. apple-legacy-rss-v1 or file-import
    url              text,
    http_status      integer,
    content_type     text,
    body             text,                           -- exactly as received
    error            text,
    attempt_count    integer      NOT NULL DEFAULT 1,
    processed_at     timestamptz,                    -- set when turned into a snapshot
    created_at       timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (chart_id, slot_start)
);

CREATE INDEX raw_reading_unprocessed_idx ON raw_reading (slot_start) WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------
-- 3. HISTORY
-- ---------------------------------------------------------------------

-- One reading of one chart, with a validity status.
--   VALID      : usable
--   INCOMPLETE : fewer entries than the minimum, or duplicate apps/ranks
--   FAILED     : fetch error, unparsable body or zero entries
CREATE TABLE snapshot (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chart_id         bigint       NOT NULL REFERENCES chart (id),
    raw_reading_id   bigint       NOT NULL UNIQUE REFERENCES raw_reading (id),
    slot_start       timestamptz  NOT NULL,
    collected_at     timestamptz  NOT NULL,
    feed_updated_at  timestamptz,                    -- feed.updated, converted to UTC
    expected_count   integer      NOT NULL,          -- depth requested
    entry_count      integer      NOT NULL DEFAULT 0,
    status           text         NOT NULL CHECK (status IN ('VALID', 'INCOMPLETE', 'FAILED')),
    reasons          text,                           -- e.g. "below_min_entries:12"
    is_baseline      boolean      NOT NULL DEFAULT false,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (chart_id, slot_start)
);

CREATE INDEX snapshot_chart_slot_idx ON snapshot (chart_id, slot_start DESC);

-- App developers (the number in the artist link: .../id1783089640).
CREATE TABLE developer (
    id                  bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apple_developer_id  text         NOT NULL UNIQUE,
    name                text         NOT NULL,
    url                 text,
    first_seen_at       timestamptz  NOT NULL,
    created_at          timestamptz  NOT NULL DEFAULT now()
);

-- One row per app, ever. Identity = Apple App ID, never the name.
CREATE TABLE app (
    id                      bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    apple_app_id            text         NOT NULL UNIQUE,
    bundle_id               text,
    developer_id            bigint       REFERENCES developer (id),
    release_date            date,
    first_seen_at           timestamptz  NOT NULL,   -- "tracked since"
    first_seen_snapshot_id  bigint       REFERENCES snapshot (id),
    last_seen_at            timestamptz  NOT NULL,
    created_at              timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX app_developer_idx ON app (developer_id);

-- How an app's store listing looked, per country. A new row only when
-- something changes; otherwise last_seen_at moves forward.
CREATE TABLE app_listing_version (
    id             bigint         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    app_id         bigint         NOT NULL REFERENCES app (id),
    country_code   varchar(2)     NOT NULL REFERENCES country (code),
    name           text           NOT NULL,
    title          text,
    summary        text,
    price_amount   numeric(12, 2),
    currency       text,
    category_id    integer,                          -- app's own category (often 6014 Games)
    category_name  text,
    rights         text,
    icon_url       text,
    preview_url    text,
    store_url      text,
    content_hash   text           NOT NULL,
    first_seen_at  timestamptz    NOT NULL,
    last_seen_at   timestamptz    NOT NULL,
    created_at     timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX app_listing_latest_idx ON app_listing_version (app_id, country_code, first_seen_at DESC);

-- The core history: which app was at which rank in which snapshot.
CREATE TABLE ranking (
    snapshot_id         bigint       NOT NULL REFERENCES snapshot (id),
    rank                integer      NOT NULL CHECK (rank >= 1),
    app_id              bigint       NOT NULL REFERENCES app (id),
    listing_version_id  bigint       REFERENCES app_listing_version (id),
    chart_id            bigint       NOT NULL REFERENCES chart (id),   -- copied for fast history queries
    slot_start          timestamptz  NOT NULL,                         -- copied for fast history queries
    PRIMARY KEY (snapshot_id, rank),
    UNIQUE (snapshot_id, app_id)
);

CREATE INDEX ranking_app_history_idx ON ranking (app_id, chart_id, slot_start);
CREATE INDEX ranking_chart_slot_idx  ON ranking (chart_id, slot_start);

-- ---------------------------------------------------------------------
-- 4. READ HELPERS
-- ---------------------------------------------------------------------

-- Readable key per chart, e.g. ph/7006/top-free
CREATE VIEW v_chart AS
SELECT ch.*,
       ch.country_code || '/' || ch.genre_id || '/' ||
       lower(replace(ch.chart_type, '_', '-')) AS chart_key,
       g.name AS genre_name,
       co.name AS country_name
FROM chart ch
JOIN genre g    ON g.id = ch.genre_id
JOIN country co ON co.code = ch.country_code;

-- Full ranking history with readable names.
CREATE VIEW v_ranking_history AS
SELECT vc.chart_key,
       r.slot_start,
       r.rank,
       a.apple_app_id,
       lv.name AS app_name,
       d.name  AS developer_name,
       r.chart_id,
       r.app_id,
       r.snapshot_id
FROM ranking r
JOIN v_chart vc ON vc.id = r.chart_id
JOIN app a      ON a.id  = r.app_id
LEFT JOIN app_listing_version lv ON lv.id = r.listing_version_id
LEFT JOIN developer d ON d.id = a.developer_id;

-- Latest VALID snapshot of each chart vs the VALID snapshot closest to
-- 24 hours earlier. change > 0 = moved up; previous_rank NULL = new entry.
CREATE VIEW v_rank_change_24h AS
WITH latest AS (
    SELECT DISTINCT ON (chart_id) id, chart_id, slot_start
    FROM snapshot
    WHERE status = 'VALID'
    ORDER BY chart_id, slot_start DESC
),
day_before AS (
    SELECT DISTINCT ON (l.chart_id) s.id, s.chart_id
    FROM latest l
    JOIN snapshot s
      ON s.chart_id = l.chart_id
     AND s.status = 'VALID'
     AND s.slot_start <= l.slot_start - interval '24 hours'
    ORDER BY l.chart_id, s.slot_start DESC
)
SELECT vc.chart_key,
       l.slot_start AS as_of,
       now_r.rank   AS current_rank,
       old_r.rank   AS previous_rank,
       old_r.rank - now_r.rank AS change,
       a.apple_app_id,
       lv.name AS app_name
FROM latest l
JOIN v_chart vc        ON vc.id = l.chart_id
JOIN ranking now_r     ON now_r.snapshot_id = l.id
JOIN app a             ON a.id = now_r.app_id
LEFT JOIN app_listing_version lv ON lv.id = now_r.listing_version_id
LEFT JOIN day_before d ON d.chart_id = l.chart_id
LEFT JOIN ranking old_r
       ON old_r.snapshot_id = d.id
      AND old_r.app_id = now_r.app_id;

COMMIT;
