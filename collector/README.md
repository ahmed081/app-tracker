# App Store ranking collector

Collects Apple App Store chart rankings every 12 hours (00:00 and 12:00 UTC) into PostgreSQL and keeps the full history: which app was at which rank, when every app was first seen, and how each app's store listing changed.

## How it works

1. **Configuration tables** say what to collect: `country`, `genre`, `tracking`, `tracking_country`. Each has an on/off switch.
2. Every minute, the collector turns that configuration into `chart` rows (country + genre + chart type) and fetches every chart whose current slot (by default the current 12-hour UTC slot) hasn't been collected yet:
   `https://itunes.apple.com/{country}/rss/topfreeapplications/limit=200/genre={genre}/json`
3. Apple's response is stored untouched in `raw_reading` (the permanent archive).
4. It is then turned into history: `snapshot` (one reading, with a status), `app`, `developer`, `app_listing_version` and `ranking`.

## Tables

| Table | One row per | Notes |
|---|---|---|
| `country` | storefront | `enabled` switch |
| `genre` | Apple category | `enabled` (yours) + `available_on_apple` (set by sync) |
| `tracking` | category + chart type | depth, interval, `all_countries`, `active` |
| `tracking_country` | category + country | `active` |
| `chart` | real chart, e.g. ph/7006/top-free | generated, never edit by hand |
| `raw_reading` | chart + hour | Apple's response as received |
| `snapshot` | chart + hour | status VALID / INCOMPLETE / FAILED |
| `developer` | developer | |
| `app` | app, ever | `first_seen_at` = tracked since |
| `app_listing_version` | app + country + listing change | name, description, price, icon… |
| `ranking` | app in a snapshot | the history |

A chart is collected only when **all** switches are on: `country.enabled`, `genre.enabled`, `genre.available_on_apple`, `tracking.active`, and `tracking_country.active` (or `tracking.all_countries`). Switching off never deletes anything; the chart becomes inactive and resumes on the same history when switched back on.

Snapshot statuses: **FAILED** (fetch error, unreadable body, no entries), **INCOMPLETE** (fewer than `MIN_ENTRIES` entries, or duplicate/invalid app IDs; duplicates get no rankings), **VALID** (everything else). Only VALID snapshots are used by `v_rank_change_24h`.

## Run with Docker (VPS or local)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD and USER_AGENT
docker compose up -d --build
docker compose logs -f collector
```

The database is created with the schema and starting configuration (Board 7004, Card 7005, Casino 7006, Top Free, Philippines) on the first start.

## Run with Node directly

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/apptracker
npm run db:schema      # create tables (once, on an empty database)
npm run db:seed        # starting configuration (safe to repeat)
npm run sync-genres    # load all Apple genres (new ones arrive disabled)
npm start              # run forever: collects every 12 hours
```

Other commands:

```bash
npm run collect                    # one collection pass now
npm run sync-charts                # apply configuration changes now
npm run ingest                     # (re)process unprocessed raw readings
node src/cli.js import feed.json ph:7006:TOP_FREE 2026-10-19T10:00:00Z   # import a saved response
```

## Change what is collected

```sql
-- Track Card in another country
INSERT INTO tracking_country (tracking_id, country_code)
SELECT id, 'id' FROM tracking WHERE genre_id = 7005 AND chart_type = 'TOP_FREE';
UPDATE country SET enabled = true WHERE code = 'id';

-- Add a new category (Puzzle), Top Free, in every enabled country
UPDATE genre SET enabled = true WHERE id = 7012;
INSERT INTO tracking (genre_id, chart_type, all_countries) VALUES (7012, 'TOP_FREE', true);

-- Stop a category everywhere / a whole country
UPDATE genre   SET enabled = false WHERE id = 7004;
UPDATE country SET enabled = false WHERE code = 'ph';
```

Changes apply within one minute.

## Useful queries

```sql
-- Where each app is now vs 24 hours ago (change > 0 = moved up, NULL previous = new)
SELECT * FROM v_rank_change_24h WHERE chart_key = 'ph/7006/top-free' ORDER BY current_rank;

-- One app's rank history
SELECT slot_start, rank FROM v_ranking_history
WHERE apple_app_id = '6738949114' AND chart_key = 'ph/7006/top-free' ORDER BY slot_start;

-- Collection health
SELECT c.chart_key, s.slot_start, s.status, s.entry_count, s.reasons
FROM snapshot s JOIN v_chart c ON c.id = s.chart_id ORDER BY s.slot_start DESC LIMIT 20;
```

## Tests

```bash
npm test                                                     # unit tests
TEST_DATABASE_URL=postgres://...test_db npm test             # also database tests (WIPES that database)
```

## Backups

History cannot be recollected. Back up daily and copy the file off the server:

```bash
docker compose exec -T postgres pg_dump -U apptracker apptracker | gzip > backup-$(date +%F).sql.gz
```
