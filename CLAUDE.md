# App Store ranking tracker: context for coding agents

Read this file first. It describes what exists, why it is built this way, what has and has not been verified, and what is left. The READMEs (root, `collector/`, `backend/`, `frontend/`) cover usage and the API in detail.

## 1. What the product does

The tracker records Apple App Store chart rankings **every 12 hours** by default (00:00 and 12:00 UTC; the interval is set per tracking row in Settings) and keeps the **full history** from the first run. It turns rank changes into **movement events**, for example "entered the Top 10", "reached #1" or "rising". It shows everything in a web dashboard (**Rankline**) in English and Arabic.

The current target is the **Philippines (`ph`)**, chart type Top Free, in three categories:

| Category | Genre ID |
|---|---|
| Board | 7004 |
| Card | 7005 |
| Casino | 7006 |

Countries, categories and chart types are configurable at runtime from the web app's **Settings** menu.

The product's most important screen is the **App Details page**, and its ranking history graph in particular. A user must understand an app's trend within a few seconds.

## 2. Architecture

```
Apple RSS feed ──► collector (Node 22) ──► PostgreSQL 16 ◄── backend (Spring Boot 3.5, Java 17) ◄── frontend (React 19, Nginx)
Apple Lookup API ─────────────────────────────────────────────►  (app details, ratings)
```

| Part | Folder | Milestones | Role |
|---|---|---|---|
| Collector | `collector/` | 1–3 | Configuration → charts; fetches each chart once per slot; stores the raw response; validates it; writes the history |
| Backend | `backend/` | 4–6 | App details (Lookup API); event engine; read API `/api/...`; Settings API `/api/manage/...` |
| Frontend | `frontend/` | 7–8 + Settings | Dashboard, ranking, movers, app page, search, Settings. Deployed separately; talks only to the API |
| Root | `docker-compose.yml`, `.env.example`, `DEPLOY.md` | | Three containers (collector, backend, frontend); PostgreSQL only with `--profile local-db` |

The **database is the only link between the collector and the backend.** They never call each other.

The collector re-reads its configuration every minute. That is why Settings changes apply within a minute and need no restart.

### Data sources (Apple, no scraping)

- **Charts.** URL pattern:
  `https://itunes.apple.com/{country}/rss/{topfreeapplications|toppaidapplications|topgrossingapplications}/limit=200/genre={id}/json`
  - Category feeds return about 100 entries, whatever limit you ask for.
  - `feed.entry` can be an array, a single object, or missing.
  - The content type is `text/javascript`.
  - `feed.updated.label` has a non-UTC offset.
- **App details.** `https://itunes.apple.com/lookup?id=a,b&country=ph&entity=software`
- **Genre tree.** `https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres?id=36`
  - Games is 6014.
  - New genres arrive **disabled**.
- Do **not** use `rss.marketingtools.apple.com`: it has no genre filter.

## 3. Database (PostgreSQL)

The schema is in `collector/db/schema.sql` and the starting data is in `collector/db/seed.sql`. The backend adds its tables with plain SQL run by the admin (**no Flyway**; the app never changes the schema): `backend/db/schema.sql` (backend tables and `app_backend`'s base rights) and `backend/db/management.sql` (the `setting` table and the Settings rights; safe to run again). Docker runs both on a new database; an existing database needs them run once by hand. A schema change means a new or edited SQL file, applied by hand.

### Configuration tables

- `country(code, name, enabled)`
- `genre(id, name, parent_id, enabled, available_on_apple)`
  - `available_on_apple` is set only by the genre sync.
- `tracking(genre_id, chart_type, depth ≤200, interval_minutes, all_countries, active)`
  - Unique on `(genre_id, chart_type)`.
- `tracking_country(tracking_id, country_code, active)`
- `chart`
  - Generated from the configuration. Never edit it by hand.
  - Unique on `(country, genre, type)`.

**A chart is collected only if every switch is on.** The view `v_tracking_target` applies this rule, and the frontend repeats it in `domain/manage.ts`:

```
country.enabled AND genre.enabled AND genre.available_on_apple AND tracking.active
AND (tracking.all_countries OR tracking_country.active)
```

### History (append-only)

- `raw_reading` is the permanent archive: Apple's response, exactly as received.
  - Key: `(chart_id, slot_start)`.
  - The only allowed update: a FAILED attempt replaced by a later successful one.
- `snapshot`: one per reading.
  - Status is VALID, INCOMPLETE or FAILED. INCOMPLETE means fewer than 25 entries or bad entries.
  - `reasons` is text, e.g. `below_min_entries:12` or `fetch_error:HTTP 503`.
  - `processed_at` is set by the backend.
- `developer` and `app`: the **Apple ID is the identity**.
- `app_listing_version`: versions are content-hashed.
- `ranking(snapshot_id, rank, app_id, ...)`.
- Slot: the UTC time truncated to the chart's interval. One reading per chart per slot.

### Backend tables (derived; everything can be rebuilt from snapshots)

- `raw_lookup`, `app_metadata_check`, `app_metadata_version`, `app_rating_daily`
- `app_chart_state`, `chart_event`, `tier_interval`
- `setting`: runtime-editable values. Key `event_rules` holds JSON. A missing row means the application.yml defaults apply.

### Views

`v_chart` (adds `chart_key` like `ph/7006/top-free`), `v_ranking_history`, `v_rank_change_24h`, `v_app_listing_latest`, `v_app_metadata_latest`, `v_app_rating_latest`.

### Database roles (least privilege; keep it this way)

| Role | Used by | Rights |
|---|---|---|
| `apptracker` | Admin and owner; runs the SQL scripts | Everything |
| `app_collector` | Collector | Read all; insert/update history. **No** configuration writes, no delete, no DDL |
| `app_backend` | Backend | Read all; write only its own tables, plus `UPDATE(processed_at)` on snapshot |

With `backend/db/management.sql`, `app_backend` can also:
- insert into `country`, `tracking` and `tracking_country`;
- update only these columns: country name and enabled, genre enabled, tracking depth/interval/all_countries/active, and tracking_country active.

`app_backend` still **cannot delete**. "Remove" means "switch off". New tables must be granted explicitly.

## 4. Event engine (backend, `events/`)

`EventEngine` is a **pure function**. It compares two consecutive VALID snapshots of a chart, plus each app's state, and returns events, new states and tier changes. `EventProcessor` feeds it pending snapshots in slot order.

- If an older snapshot arrives after newer ones were processed, the chart is rebuilt.
- A rebuild replays all snapshots and marks events `notified = true`, so a rebuild never sends alerts.

**Event types:**
- FIRST_OBSERVED, NEW_ENTRY, RE_ENTRY, LEFT_CHART
- ENTERED_TOP_N / LEFT_TOP_N (tiers 10 and 5)
- REACHED_NUMBER_ONE / LOST_NUMBER_ONE
- NEW_BEST (low importance; suppressed for 7 days after the chart's first snapshot)
- BIG_MOVE (5 or more places in one step)
- RISING_STARTED / RISING_ENDED: over the last 24 hours (`rising-hours`, turned into readings at the chart's interval), at least 50% of the steps are gains (`rising-gain-percent`) and at least 10 places net
- MOVED_UP / MOVED_DOWN

**Rules:**
- The primary event per app and step is the most important one, then the first in enum order.
- Display depth is 25.
- Tier intervals are kept for 1, the configured tiers, and 25.
- A step longer than 3× the interval is flagged as a gap.

**Where the rules come from:**
- Defaults are in `application.yml → apptracker.events`.
- The Settings menu can override tiers, big move, rising and new-best days. These are stored in `setting.event_rules` and read through `manage/RulesStore`, cached for 15 seconds.
- Allowed tier choices are 3, 5, 10 and 20, because app pages show time spent in the Top 5 and Top 10.

## 5. Backend (`backend/`)

**Stack:**
- Spring Boot 3.5.6, Java 17.
- **NamedParameterJdbcTemplate, no JPA.** No Flyway (see section 3).
- Listens on `PORT`, default 8081; docker-compose sets 8080 inside the container (host side `BACKEND_BIND`, default 127.0.0.1:8084).
- Database login from `JDBC_URL`, `DATABASE_USER`, `DATABASE_PASSWORD`. Locally, real values go in `backend/config/application.yml` (git-ignored; Spring reads it when started from `backend/`).
- `ShallowEtagHeaderFilter` (ETag / 304 on `/api/*`).
- springdoc at `/swagger-ui.html`.
- Scheduler pool size 2.

**Packages:**
- `config`: AppProperties record, WebConfig (CORS, admin-key interceptor), ClockConfig.
- `metadata`: Lookup client, parser, scheduled refresh every 5 minutes.
- `events`: the engine, the processor (runs every minute) and its repository.
- `api`: the public read API. Charts: `/api/charts/{country}/{genreId}/{type}/{ranking|headlines|movers|events|bump}`. Apps: `/api/apps/{id}[/history|/events|/versions|/ratings]`, `/api/search`, `/api/admin/...`.
- `manage`: the Settings API, `/api/manage/{countries,genres,tracking,rules,status,actions/*}`: `ManageController`, `ManageService` (validation), `ManageRepository`, `RulesStore`, `EventRules`, `RebuildJob`.
  - Validation errors return 400 with `{"errors": {field: message}}`.
  - Conflicts return 409.
  - Rebuilding all events runs on a background thread; its progress appears in `/status`.

**Access:**
- `/api/manage/**` and `/api/admin/**` are **open when `ADMIN_KEY` is empty**. This is the owner's explicit choice for now.
- When `ADMIN_KEY` is set, requests need the header `X-Admin-Key`.
- `.env.example` ships with the key empty. Before the VPS is public, the owner should set it.

**Tests:**
- `EventEngineTest`, `LookupParserTest`, `ApiHelpersTest`, `EventRulesTest`: 26 tests (`mvn test`).
- The owner's rule: **keep tests light. Unit tests and migration tests only.** H2 is only an option for migration tests; the app itself uses PostgreSQL.

## 6. Collector (`collector/`)

- Node 22, ES modules. The only dependency is `pg`.
- `.env` is loaded through `process.loadEnvFile`; real environment variables take precedence.
- **Requests to Apple:** 1 request per second; timeouts and retries at 10, 30 and 60 seconds; Retry-After is respected; up to 60 seconds of jitter.
- **Schedule:** a 60-second tick; failed charts retry after 5 minutes; genre sync every 7 days.
- `MIN_ENTRIES` is 25.
- **CLI** (`src/cli.js`): `db:schema`, `db:seed`, `sync-genres`, `sync-charts`, `collect`, `ingest`, `import <file> ph:7006:TOP_FREE <slot>`, `run`. `run` takes advisory lock 4242001, so only one collector runs at a time.
- **Tests:** `npm test`, 16 tests. Database tests need `TEST_DATABASE_URL`. On Windows `npm test` fails to expand `test/*.test.js`; run `node --test test/*.test.js` from Git Bash.
- **Example configuration scripts:** `collector/db/activate-us.sql` turns on every category in the US.

## 7. Frontend (`frontend/`)

**The owner's requirements:**
- Latest stable React and TypeScript.
- Functional components and hooks.
- **Redux Toolkit** for global state and **Redux Saga** for side effects.
- Modular and strongly typed.
- Reusable UI components, rather than page-specific copies.
- Presentation, state, the API layer and domain logic kept separate.
- No unnecessary dependencies and no overengineering.
- An **independent deployment**, with the backend behind a clean API layer.
- **English and Arabic from the start**, including right-to-left layout.

**Stack:** React 19.3, TypeScript 7, Vite 8, React Router 8 (`createBrowserRouter`, lazy routes), RTK 2.13, redux-saga 1.5, i18next 26 / react-i18next 17, Tailwind 4, Recharts 3, lucide-react, Readex Pro (self-hosted, covers Arabic), vitest.

**Structure (`src/`):**
- `api/`
  - `trackerApi.ts` (reads) and `manageApi.ts` (Settings reads and writes) are the **only modules that know URLs**.
  - `types.ts` and `manageTypes.ts` mirror the backend records **by hand**.
- `features/remote/`: one cache for every GET resource.
  - Use it as `useResource('ranking', params)`.
  - The saga handles fetching, de-duplication, a 60-second freshness window, refresh every 5 minutes and when the tab comes back, and invalidation.
- `features/manage/`: saving.
  - Use it as `useMutation(op, id).run(params)`.
  - The saga calls the API, then invalidates the affected resources.
  - A 401 response triggers the admin-key prompt. The key is kept in sessionStorage only.
- `features/preferences/`: language, theme, period, noise filter, chart and last visit, persisted in localStorage.
- `domain/`: pure, unit-tested rules: ranks, history gaps and markers, event messages, and `manage.ts`, which holds the target-chart rule, previews, validation, collector health and reason codes.
- `i18n/`: `locales/en.json` and `ar.json`.
  - A test enforces that both files have the same keys, that Arabic has all six plural forms, and that every literal `t('...')` key used in the code exists.
  - Arabic uses Western digits (`ar-u-nu-latn`).
- `components/`:
  - `ui/`: Panel, SegmentedControl, Select, Switch, Button, Field/TextInput/ToggleChip, Notice, States, RankDelta, badges.
  - `app/`, `charts/` and `layout/`.
- `pages/`: Overview, Ranking, Movers, App, Search, NotFound, and `settings/` (Countries, Tracking, Rules, Status, plus the layout).

**Conventions:**
- Use logical CSS properties (start/end) so the layout mirrors in right-to-left.
- **Charts stay left-to-right** (`dir="ltr"`).
- Put `dir="auto"` on app names.
- Up and down colours are always paired with arrows.
- Colours are tokens in `styles.css`. The bump chart's series palette is `--cat-1..8`, maximum 8 series.

**Runtime configuration:**
- The API address comes from `/config.js` (`window.__APP_CONFIG__`).
- The Nginx entrypoint writes that file from `API_UPSTREAM` (Nginx proxies `/api`) or `API_BASE_URL` (the browser calls the API directly), and regenerates the CSP `connect-src` on every start.

**Development:**
- `npm run dev:mock` serves a fake API from `mock/` (recorded fixtures plus an in-memory fake of `/api/manage` in `mock/mock-manage-api.ts`). It sets the variable the Unix way: on Windows, run it from Git Bash.
- `npm run dev` proxies `/api` to `localhost:8081`.

**Tests:** 33 tests (`npm test`); type-check and build with `npm run build`.

## 8. Run it

```bash
cp .env.example .env              # database logins (COLLECTOR_DATABASE_URL, BACKEND_JDBC_URL/USER/PASSWORD), ADMIN_KEY, USER_AGENT
docker compose up -d --build      # collector, backend (BACKEND_BIND, default 127.0.0.1:8084), frontend (FRONTEND_BIND, default 127.0.0.1:3003)
docker compose logs -f collector backend
```

The containers use the database named in `.env` (today the existing `app_tracker_db`, one owner login `app_tracker_user`). `DEPLOY.md` is the server guide: Docker install, copying the project, Caddy for HTTPS, firewall, backups (`docker compose --profile tools run --rm -T backup`). Never run a local collector or backend against the same database as the server: the collector's advisory lock makes the second one exit, and two backends would both create events.

With `--profile local-db`, a `postgres` container is added. On its first start (empty volume), Postgres's init scripts apply the collector's schema and seed, create `app_collector` and `app_backend`, and apply `backend/db/schema.sql` and `backend/db/management.sql`. On an existing database, run `backend/db/management.sql` once as the admin.

Secrets live only in `.env`. It is git-ignored; set it to `chmod 600`. Use only letters, digits, `-` and `_` in passwords.

## 9. Verification status: read this before trusting anything

The earlier work was done in a sandbox that could not reach Apple or Maven Central.

**Verified:**
- The collector's logic, against a sample PH Casino feed and a fake Apple server.
- Every SQL statement, on PostgreSQL 16.
- Both roles' permissions, including that deletes are refused.
- The event engine, on 10 days of simulated hourly data, including failures and a 5-hour outage.
- The backend's Java, compiled against stand-ins for Spring classes; its unit tests run.
- The frontend's tests, type-check and build.
- The frontend screens, viewed in a headless browser against the fake API.

**Never verified:**
1. **The backend starting under real Spring Boot against PostgreSQL.** It now compiles and its unit tests pass with real Maven, but it has never been started. Expect startup or SQL errors: bean wiring, Jackson records, `ProblemDetail`, `@ConfigurationProperties` binding.
   - The **Settings feature** (backend `manage` package, `management.sql`, frontend `pages/settings`) was written after the original sandbox work. It compiles, its unit tests pass, and its screens were viewed against the fake API in English and Arabic. It has **not** run against PostgreSQL: check the column-level grants (an UPDATE that touches an ungranted column fails), the `COALESCE(CAST(:x AS ...))` updates, and the `setting` jsonb round trip.
2. **The collector against live Apple.** Confirm the PH feeds respond, how many entries they return (100 or 200), and the genre sync.
3. **The frontend against the real backend.** The hand-written TypeScript types may not match the JSON the backend actually returns.
4. **An end-to-end run on real data** (Docker Compose, all four services).

## 10. What is left (in priority order)

1. **Make it run for real.**
   - Run `mvn verify` and fix any errors (done: it builds; 26 tests pass).
   - Run `docker compose up -d --build`.
   - Check the logs of all services.
   - Hit the API (`curl /api/charts`, `/ranking`, `/api/manage/status`).
   - Open the web app and click through every page, including Settings in both languages.
   - Fix any mismatch between `frontend/src/api/*Types.ts` and the real JSON.
2. **Collector live check.**
   - Run `sync-genres`.
   - Run one `collect`.
   - Confirm `snapshot` status counts and `entry_count`.
   - Adjust the depth defaults if the PH feeds cap at 100.
3. **VPS deployment.** `DEPLOY.md` is a manual guide: Docker install, Caddy for HTTPS, a firewall allowing only ports 22, 80 and 443, and a daily `pg_dump` with rotation.
   - Not done yet: the images have never been built or run (Docker wasn't running when this was written), and there is no automated `deploy.sh` and no health-check alerting.
   - The owner hasn't yet given the VPS's Linux version, domain or memory. **Ask the owner** for them; never ask for passwords or SSH keys in chat.
4. **Monitoring.** Alert when collection stops, for example when the last reading is older than 2 hours or there are delayed charts. Add a daily canary check of one feed. The Status page shows this today, but nothing notifies anyone.
5. **Snapshot validation.**
   - The original design had extra "partial" and "suspicious" statuses: for example a sudden drop in entry count, or a chart identical to the previous hour's for many hours.
   - Today only VALID, INCOMPLETE and FAILED exist, so a strange but complete-looking reading could create false events.
6. **Rule tuning** after 1–2 weeks of real data: rising, big move, noise in the event feed. This is done in Settings; recompute if needed.
7. **Smaller items:**
   - Regenerate the fake-API fixtures from real data. Fixtures have no app icons; real icons come from Lookup.
   - Consider generating the frontend types from the OpenAPI spec (`/v3/api-docs`).
   - Decide how long to keep `raw_reading` bodies.
   - Update the functional and architecture documents to match the implementation. They predate the Node collector, the three statuses, the in-backend Lookup and Redux.
8. **Milestone 9 (not started):** user accounts, watchlists, alerts and a notifier. `chart_event.notified` already exists for the notifier. The admin key would then give way to real logins.

## 11. Working agreements with the owner

- Propose a plan and get approval before large features; the owner likes to approve first.
- Keep tests light (unit and migration tests); avoid heavy integration suites.
- Never delete history. Switching off is the only form of removal.
- Every visible text goes in **both** `en.json` and `ar.json`, with full Arabic plurals.
- Keep the API and service layer clean: only `src/api/*` knows URLs, and pages never call `fetch`.
- Prefer few, maintained dependencies.
- Don't put secrets in code, commits or chat.
