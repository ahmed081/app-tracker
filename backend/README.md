# App Store ranking tracker: backend

Spring Boot 3 application (Java 17) that works on the database filled by the collector. It does three jobs:

| Milestone | What it does | When |
|---|---|---|
| **4. App details** | Looks up every app that charted recently with Apple's Lookup API: rating, rating count, version, release notes, size, languages, screenshots. Keeps every change (`app_metadata_version`) and one rating row per day (`app_rating_daily`). Raw responses are archived in `raw_lookup`. | every 5 minutes, each app refreshed daily per country |
| **5. Ranking events** | Compares each new VALID snapshot with the previous one: new entries, exits, Top 10 / Top 5 / #1 crossings, big moves, new best ranks, rising apps; keeps each app's state per chart and the time it spent in each tier. | every minute |
| **6. API** | Read API for the web app, the Settings API behind the web app's Settings menu, and admin actions (below). | always |

Everything the backend writes in milestone 5 is derived from snapshots and can be rebuilt at any time (`POST /api/manage/actions/rebuild-events`, or one chart with `POST /api/admin/charts/{country}/{genre}/{type}/rebuild`), for example after changing a rule.

## Run

With Docker, from the project root: `docker compose up -d --build` (see the root README).

Without Docker (Java 17, Maven 3.6+ and a PostgreSQL that already has the collector's schema):

```bash
# once, as the database admin: the backend's login
psql "postgres://apptracker:ADMIN_PASS@localhost:5432/apptracker" -v backend_password='BACKEND_PASS' -f db/create-backend-user.sql
psql "postgres://apptracker:ADMIN_PASS@localhost:5432/apptracker" -f db/schema.sql
psql "postgres://apptracker:ADMIN_PASS@localhost:5432/apptracker" -f db/management.sql

export JDBC_URL=jdbc:postgresql://localhost:5432/apptracker
export DATABASE_USER=app_backend DATABASE_PASSWORD=BACKEND_PASS     # the app runs as app_backend
export ADMIN_KEY=some-secret
mvn spring-boot:run
```

API documentation (Swagger UI): http://localhost:8081/swagger-ui.html (port 8081 by default, `PORT` to change; Docker uses 8080)

## API

Charts are addressed as `{country}/{genreId}/{type}`, e.g. `ph/7006/top-free`. Apps by Apple App ID. Windows and ranges: `1h`, `24h`, `7d`, `30d`, `3m`, `1y`, `all`.

| Endpoint | Returns |
|---|---|
| `GET /api/charts` | All charts with `asOf` (latest reading shown) and `delayed` |
| `GET /api/charts/ph/7006/top-free/ranking?window=24h&limit=25` | Current Top 25: change vs previous reading and vs 24h ago, status (NEW/UP/DOWN/SAME), badges (NUMBER_ONE, TOP_10, TOP_5, NEW_ENTRY…), rising flag, 7-day trend; plus apps that just left the chart |
| `GET /api/charts/ph/7006/top-free/headlines?window=24h` | Current #1 and since when, new #1s, entries into the Top 10, biggest climber and drop, new entries, `quiet` |
| `GET /api/charts/ph/7006/top-free/movers?window=7d&minPlaces=3` | Climbers, fallers, new entries, exits, rising apps, tier crossings |
| `GET /api/charts/ph/7006/top-free/events?minImportance=2` | Event feed with a readable sentence per event (default: last 7 days, medium+, one line per app) |
| `GET /api/charts/ph/7006/top-free/bump?window=7d&top=10` | Rank lines of the current top apps (bump chart) |
| `GET /api/apps/{appleAppId}` | Listing and details per country, and per chart: current rank, 24h/7d change, best/worst/30-day average rank, hours at #1 / Top 5 / Top 10 / Top 25 |
| `GET /api/apps/{appleAppId}/history?chart=ph/7006/top-free&range=30d` | Rank over time (best rank per step) |
| `GET /api/apps/{appleAppId}/events` · `/versions` · `/ratings` | App timeline, listing and version changes, daily ratings |
| `GET /api/search?q=tongits` | Apps by name, developer, Apple ID or bundle ID, with current ranks |
| `POST /api/admin/events/run` | Process pending snapshots now |
| `POST /api/admin/charts/ph/7006/top-free/rebuild` | Recompute a chart's events from its snapshots |
| `POST /api/admin/metadata/run` | Run app lookups now |

### Settings API (`/api/manage`)

Used by the web app's Settings menu. Nothing is ever deleted: "remove" means "switch off".

| Endpoint | Does |
|---|---|
| `GET /api/manage/countries` · `POST` · `PATCH /countries/{code}` | List countries (with charts collected), add one, rename or switch on/off |
| `GET /api/manage/genres` · `PATCH /genres/{id}` | List categories, switch one on/off |
| `GET /api/manage/tracking` · `POST` · `PATCH /tracking/{id}` | What is tracked (with the charts it produces); add a category + chart type; change depth, interval, all countries, on/off |
| `PUT /api/manage/tracking/{id}/countries/{code}` | Add a country to a tracking row, or switch it on/off there |
| `GET /api/manage/rules` · `PUT` · `DELETE` | Event rules in force and the defaults; save; back to the defaults |
| `GET /api/manage/status` | Collector health per chart (latest reading, reasons, delays), pending events, the rebuild job |
| `POST /api/manage/actions/{process-events,rebuild-events,refresh-metadata}` | Process pending readings now; recompute every chart's events in the background (progress in `/status`); look up app details now |

A rejected change returns `400` with `{"errors": {"depth": "Must be between 1 and 200"}}`; a duplicate or a rebuild already running returns `409`.

### Access

`/api/manage/**` and `/api/admin/**` need the header `X-Admin-Key: <ADMIN_KEY>` when `ADMIN_KEY` is set. **With no `ADMIN_KEY` they are open** to anyone who can reach the API: set it before the server is public. Responses carry an `ETag`, so repeated requests between readings get `304 Not Modified`.

Event importance: 3 high (#1, Top 10/Top 5 crossings), 2 medium (entries, exits, big moves, rising), 1 low (ordinary moves, new best rank), 0 none (first observed).

## Rules (application.yml → `apptracker.events`, editable in Settings)

The defaults come from `application.yml`. The Settings menu can override the tiers (3, 5, 10, 20), big move, the rising rule and the new-best delay; they are stored in the `setting` table (`event_rules`) and apply within 15 seconds, without a restart.

| Setting | Default | Meaning |
|---|---|---|
| `display-depth` | 25 | Chart size shown; entering/leaving it = NEW_ENTRY / LEFT_CHART |
| `tiers` | 10, 5 | Lines that produce "entered/left the Top N" |
| `big-move-places` | 5 | One-step move that counts as a big move |
| `rising-hours` / `rising-gain-percent` / `rising-min-net-places` | 24 / 50 / 10 | Rising = over the last 24 hours, at least half of the readings are gains and 10 places net. Measured on the readings' real times, so it means the same at any interval, including right after the interval changes: 24 readings when hourly, 6 when every 4 hours |
| `new-best-after-days` | 7 | No "new best" during the first week of a chart |
| `gap-factor` | 3 | A step longer than 3 intervals is flagged as a gap |

New rules apply to new readings. To apply them to the past too, recompute (Settings → Event rules, or `POST /api/manage/actions/rebuild-events`).

## Database user

The backend runs as `app_backend`: it reads everything and writes only its own tables (details, ratings, events, app states, tier intervals, `snapshot.processed_at`). It cannot change the rankings or the collector's history, and cannot create or drop tables. For the Settings menu it can also add countries, tracking rows and tracking countries, and flip their switches (`db/management.sql`), but never delete them. Its tables are created separately by the admin (`db/schema.sql`, `db/management.sql`).

## Tests

```bash
mvn verify
```

Unit tests cover the event engine (baseline, the functional spec's worked example, #12 → #1, new entry vs re-entry, exits with and without a new rank, gaps, rising, new best, tier intervals), the Lookup parser, the API helpers, and the editable event rules (validation, defaults, merging a saved row).
