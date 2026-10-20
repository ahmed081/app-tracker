# App Store ranking tracker: backend

Spring Boot 3 application (Java 17) that works on the database filled by the collector. It does three jobs:

| Milestone | What it does | When |
|---|---|---|
| **4. App details** | Looks up every app that charted recently with Apple's Lookup API: rating, rating count, version, release notes, size, languages, screenshots. Keeps every change (`app_metadata_version`) and one rating row per day (`app_rating_daily`). Raw responses are archived in `raw_lookup`. | every 5 minutes, each app refreshed daily per country |
| **5. Ranking events** | Compares each new VALID snapshot with the previous one: new entries, exits, Top 10 / Top 5 / #1 crossings, big moves, new best ranks, rising apps; keeps each app's state per chart and the time it spent in each tier. | every minute |
| **6. API** | Read-only REST API for the web app (below), plus admin actions. | always |

Everything the backend writes in milestone 5 is derived from snapshots and can be rebuilt at any time (`POST /api/admin/charts/{country}/{genre}/{type}/rebuild`), for example after changing a rule in `application.yml`.

## Run

With Docker, from the project root: `docker compose up -d --build` (see the root README).

Without Docker (Java 17, Maven 3.6+ and a PostgreSQL that already has the collector's schema):

```bash
# once, as the database admin: the backend's login
psql "postgres://apptracker:ADMIN_PASS@localhost:5432/apptracker" -v backend_password='BACKEND_PASS' -f db/create-backend-user.sql
psql "postgres://apptracker:ADMIN_PASS@localhost:5432/apptracker" -f db/schema.sql

export JDBC_URL=jdbc:postgresql://localhost:5432/apptracker
export DATABASE_USER=app_backend DATABASE_PASSWORD=BACKEND_PASS     # the app runs as app_backend
export ADMIN_KEY=some-secret
mvn spring-boot:run
```

API documentation (Swagger UI): http://localhost:8080/swagger-ui.html

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

Admin endpoints need the header `X-Admin-Key: <ADMIN_KEY>`; with no `ADMIN_KEY` set they are disabled. Responses carry an `ETag`, so repeated requests between hourly readings get `304 Not Modified`.

Event importance: 3 high (#1, Top 10/Top 5 crossings), 2 medium (entries, exits, big moves, rising), 1 low (ordinary moves, new best rank), 0 none (first observed).

## Rules (application.yml → `apptracker.events`)

| Setting | Default | Meaning |
|---|---|---|
| `display-depth` | 25 | Chart size shown; entering/leaving it = NEW_ENTRY / LEFT_CHART |
| `tiers` | 10, 5 | Lines that produce "entered/left the Top N" |
| `big-move-places` | 5 | One-step move that counts as a big move |
| `rising-window` / `rising-min-gains` / `rising-min-net-places` | 24 / 12 / 10 | Rising = over the last 24 readings, at least 12 gains and 10 places net |
| `new-best-after-days` | 7 | No "new best" during the first week of a chart |
| `gap-factor` | 3 | A step longer than 3 intervals is flagged as a gap |

After changing a rule, rebuild the chart so its history follows the new rule.

## Database user

The backend runs as `app_backend`: it reads everything and writes only its own tables (details, ratings, events, app states, tier intervals, `snapshot.processed_at`). It cannot change the configuration, the rankings or the collector's history, and cannot create or drop tables. Its tables are created separately by the admin (`db/schema.sql`).

## Tests

```bash
mvn verify
```

Unit tests cover the event engine (baseline, the functional spec's worked example, #12 → #1, new entry vs re-entry, exits with and without a new rank, gaps, rising, new best, tier intervals), the Lookup parser, and the API helpers.
