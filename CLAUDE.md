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
| Root | `docker-compose.yml`, `.env.example`, `DEPLOY.md` | | Three containers (collector, backend, frontend); the database runs outside Docker |

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

The schema is in `collector/db/schema.sql` and the starting data is in `collector/db/seed.sql`. The backend adds its tables with plain SQL run by the admin (**no Flyway**; the app never changes the schema): `backend/db/schema.sql` (backend tables and `app_backend`'s base rights) and `backend/db/management.sql` (the `setting` table and the Settings rights; safe to run again). `backend/db/watchlist.sql` and `backend/db/radar.sql` (Radar themes and dismissals) follow the same rule. The real database has a single owner login and no `app_backend` role, so new scripts grant to `app_backend` only `IF EXISTS`. Docker runs both on a new database; an existing database needs them run once by hand. A schema change means a new or edited SQL file, applied by hand.

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
- `radar_theme` (name, keywords, active; 14 seed themes) and `radar_dismissal` (app hidden from the Radar while active). Switched off, never deleted.
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
- RISING_STARTED / RISING_ENDED: over the last 24 hours (`rising-hours`, measured on the readings' real times, so it holds when the interval changes), at least 50% of the steps are gains (`rising-gain-percent`) and at least 10 places net
- MOVED_UP / MOVED_DOWN

**Rules:**
- The primary event per app and step is the most important one, then the first in enum order.
- Display depth is 25.
- Tier intervals are kept for 1, the configured tiers, and 25.
- A step longer than 3× the interval is flagged as a gap.
- Graphs (`/history`, `/bump`) never use a step shorter than the chart's interval, so the frontend's gap rule (a hole of more than 3 steps breaks the line) never mistakes the time between readings for the app leaving the chart. Lone points between two breaks are drawn as dots.

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
- `manage`: the Settings API, `/api/manage/{countries,genres,tracking,categories/{genreId},rules,status,actions/*}`: `ManageController`, `ManageService` (validation), `ManageRepository`, `RulesStore`, `EventRules`, `RebuildJob`.
    - Validation errors return 400 with `{"errors": {field: message}}`.
    - Conflicts return 409.
    - `PUT /categories/{genreId}` saves a whole category in one transaction: its switch (`genre.enabled`), its chart types (missing rows created, the others switched off) and the depth, interval and countries shared by its chart types. The Tracking page uses only this write.
    - Rebuilding all events runs on a background thread; its progress appears in `/status`.
- `radar`: the Radar, `/api/radar` (read), `/api/radar/themes` (GET, POST, PUT `/{id}`) and `/api/radar/dismiss`. Computed at read time and cached 10 minutes per parameter set. Pure, unit-tested helpers: `Words` (stop words in `resources/radar/stopwords.txt`), `KnownThemes`, `RadarScorer` (points in the `Reason` enum; "new" means more than 48 h after the chart's first VALID reading, and only for apps that reached the chart's top 75%: the last ranks of the 100-entry feeds churn with old apps; a climb must also end there), `EmergingWords`, `Clusters`, `AbroadNotHere`. Words come from the name plus the first sentence of the listing summary (Apple's feed has no subtitle).

**Access:**
- `/api/manage/**` and `/api/admin/**` are **open when `ADMIN_KEY` is empty**. This is the owner's explicit choice for now.
- When `ADMIN_KEY` is set, requests need the header `X-Admin-Key`.
- Writes to `/api/watch/**`, `/api/alerts/**` and `/api/radar/**` need the key as well; their GETs stay open.
- `.env.example` ships with the key empty. Before the VPS is public, the owner should set it.

**Tests:**
- `EventEngineTest`, `LookupParserTest`, `ApiHelpersTest`, `EventRulesTest`: 30 tests (`mvn test`).
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
- `pages/`: Overview, Ranking, Movers, App, Search, Watchlist, Radar (tabs Radar and Themes; components in `components/radar/`, rules in `domain/radar.ts`), NotFound, and `settings/` (Countries, Tracking, Rules, Status, plus the layout).
    - Settings → Tracking lists each category once (`domain/manage.ts → groupCategories`), with search, an on/off filter and an "Add category" form that searches Apple's genre list.

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

**Tests:** 39 tests (`npm test`); type-check and build with `npm run build`.

## 8. Run it

```bash
cp .env.example .env              # database logins (COLLECTOR_DATABASE_URL, BACKEND_JDBC_URL/USER/PASSWORD), ADMIN_KEY, USER_AGENT
docker compose up -d --build      # collector, backend (BACKEND_BIND, default 127.0.0.1:8084), frontend (FRONTEND_BIND, default 127.0.0.1:3003)
docker compose logs -f collector backend
```

The containers use the database named in `.env` (today the existing `app_tracker_db`, one owner login `app_tracker_user`). `DEPLOY.md` is the server guide: Docker install, copying the project, Caddy for HTTPS, firewall, backups (`docker compose --profile tools run --rm -T backup`). Never run a local collector or backend against the same database as the server: the collector's advisory lock makes the second one exit, and two backends would both create events.

There is no database container. A new database is set up by hand with the SQL scripts (DEPLOY.md section 8): the collector's schema and seed, `create-user.sql` / `create-backend-user.sql` for `app_collector` and `app_backend`, then `backend/db/schema.sql`, `backend/db/management.sql`, `backend/db/watchlist.sql` and `backend/db/radar.sql`. On an existing database, run the missing ones once as the admin (all are safe to run again).

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
8. **Milestone 9: Watchlist and Alert rules.** Approved, not started. The spec is the section **"Milestone 9"** at the end of this file.
    - In scope: a shared watchlist, alert rules, and alerts shown in the app.
    - Out of scope: accounts, email, Telegram.
    - The M9 section mentions "Migration `V4__watchlist.sql` (Flyway)". There is no Flyway (section 3): write that schema as `backend/db/watchlist.sql`, applied by hand like `management.sql`.
9. **Milestone 10: Radar (spotting new niches).** Built (backend and frontend). The spec is the section **"Milestone 10"** at the end of this file.
    - `radar.sql` is applied on the server (2026-10-23) and the Radar runs there (about 0.5 s uncached, cached 10 minutes). Checked against real data: bottom-of-chart churn no longer counts as new, words seen abroad need 3 apps, and "in the Top 25 since" is null when it only means "since tracking began".
    - Not done yet: `RadarMigrationTest` was not re-run on the final script; rule tuning once there are 2+ weeks of data.
    - The frontend was viewed against the fake API (`mock/mock-radar-api.ts`) in English and Arabic.

## 11. Working agreements with the owner

- Propose a plan and get approval before large features; the owner likes to approve first.
- Keep tests light (unit and migration tests); avoid heavy integration suites.
- Never delete history. Switching off is the only form of removal.
- Every visible text goes in **both** `en.json` and `ar.json`, with full Arabic plurals.
- Keep the API and service layer clean: only `src/api/*` knows URLs, and pages never call `fetch`.
- Prefer few, maintained dependencies.
- Don't put secrets in code, commits or chat.

# Milestone 9: Watchlist and Alert rules (approved scope)

The owner approved this scope on 2026-10-21. Read `CLAUDE.md` first for project context and working agreements.

**In scope:**
- a watchlist;
- alert rules;
- alerts shown **inside the web app** (the bell and the Alerts page).

**Out of scope, do not build:**
- user accounts or sign-in;
- email, Telegram or any other outside channel;
- a background notifier job;
- notification rows stored per alert.

## Owner decisions

| Question | Decision |
|---|---|
| Whose watchlist? | **One shared watchlist, stored on the server.** It is the same on every device, for everyone who can reach the site. |
| Protection | **Same as Settings.** If `ADMIN_KEY` is empty, everything is open. If it is set, *writes* (follow, unfollow, rule changes, "mark as seen") need `X-Admin-Key`. *Reads* (watchlist, alerts, unread count) stay open. |

## 1. Functional

### Watchlist
- **Follow buttons** (☆ / ★, toggle):
    - on the app page header (choice: this chart, or all charts of the app);
    - on each ranking row;
    - on movers lists;
    - on search results;
    - on the chart toolbar ("Follow this chart").
- **Two kinds of follow:**
    - **App:** in one chart (`chart_id` set) or in every chart the app appears in (`chart_id` empty).
    - **Chart:** its big moments only, not every app in it. Big moments are:
        - a new #1 (`REACHED_NUMBER_ONE`);
        - an app entering the chart's highest configured tier (`ENTERED_TOP_N` where tier = the largest tier in the event rules);
        - an app entering the chart (`NEW_ENTRY`) **only if its rank is within that tier**.
- **My watchlist page** (`/watchlist`, a new menu item):
    - One row per followed app and chart: current rank, change over the selected period, 7-day sparkline, last important event, and the rule preset name.
    - An app followed in "all charts" shows one line per chart it currently ranks in.
    - Followed charts appear as cards: current #1 and the latest key move.
    - Period switch (1H / 24H / 7D / 30D) and a chart filter, reusing `ChartToolbar` / `SegmentedControl`.
    - Empty state: explain how to follow, with a link to the Ranking page.
- **Unfollowing switches the watch off** (`active = false`); nothing is deleted. Following again reactivates the same row and keeps its rule.

### Alert rules
- **Each watch has exactly one rule.** There are three presets:
    - **IMPORTANT** (default): `REACHED_NUMBER_ONE`, `LOST_NUMBER_ONE`, `ENTERED_TOP_N`, `LEFT_TOP_N`, `LEFT_CHART`.
    - **ALL**: IMPORTANT plus `BIG_MOVE`, `RISING_STARTED`, `NEW_ENTRY`, `RE_ENTRY`, and `NEW_VERSION` (see below).
    - **CUSTOM**, with three settings:
        - which event types (checkboxes from the list above);
        - a minimum move in places for `BIG_MOVE`, `MOVED_UP` and `MOVED_DOWN` (default 10; allows `MOVED_UP`/`MOVED_DOWN` to be included);
        - which tiers count for `ENTERED_TOP_N` / `LEFT_TOP_N` (subset of the configured tiers; default all).
- Chart watches use their fixed "big moments" set; their rule is not editable in v1.
- **The rule editor** is a small panel, opened from the watchlist row or the Follow button's menu.
    - It shows a **live preview**: "With this rule you would have had N alerts in the last 7 days", plus the 3 most recent examples.
- **`NEW_VERSION`** is not a chart event. It comes from `app_metadata_version`: a row whose `version` differs from the previous row for the same app and country.
    - It is an app-level alert: it appears once, not per chart.
    - It applies only to app watches.

### Alerts
- **🔔 bell** in the header, next to the language switch.
    - It shows the count of alerts newer than "last seen", and shows "99+" above 99.
    - It refreshes on the existing 5-minute remote cycle and when the tab comes back.
- **Alerts page** (`/alerts`):
    - Matching alerts, newest first, **grouped by collection hour** ("Today 14:00", "Yesterday 09:00").
    - Uses the existing event sentences (`domain/events.ts` / `EventList` styling) and links to the app page with `?chart=`.
    - Alerts newer than "last seen" are highlighted.
    - Filters: app, chart, event type, period (24H / 7D / 30D).
    - Older alerts are paged with a "Load more" button.
    - A **"Mark all as seen"** button sets "last seen" to now.
- **Quieter feed (cooldown):**
    - The same watch, the same app, the same chart and the same event type is shown at most once per **3 hours**. The first occurrence is shown, later ones are hidden.
    - The cooldown is applied at read time, so it is not stored.
    - Opposite events are not merged: `ENTERED_TOP_N` and `LEFT_TOP_N` are different types.
- **Gap events stay out of alerts:** events with `gap = true`, which follow a collection outage, are excluded from alerts. They are still shown on app pages.
- **Duplicates:** an app followed both "in one chart" and "in all charts" must not produce the same alert twice. De-duplicate by `chart_event.id`, keeping the most permissive matching watch.

## 2. Technical design

### Key principle: alerts are computed at read time, never stored
- An alert is "a `chart_event` (or version change) that matches an active watch's rule".
- The query joins events with watches and rules.
- Consequences:
    - Rule changes apply immediately, including to past alerts.
    - Recomputing events from Settings, which deletes and recreates `chart_event` rows, cannot break anything.
    - There is no notifier job.
- **"Unread"** = alerts with `occurred_at > setting['alerts_seen_at']`.
- Do not use `chart_event.notified`; it is reserved for a future outside notifier.

### Migration `V4__watchlist.sql` (Flyway, runs as `apptracker`)

```
watch
  id           bigint identity PK
  user_id      bigint NULL            -- always NULL for now; room for future accounts
  kind         text   CHECK (kind IN ('APP','CHART'))
  app_id       bigint NULL REFERENCES app(id)
  chart_id     bigint NULL REFERENCES chart(id)   -- APP: NULL = all charts of the app
  active       boolean NOT NULL DEFAULT true
  created_at, updated_at timestamptz
  CHECK ((kind='APP' AND app_id IS NOT NULL) OR (kind='CHART' AND app_id IS NULL AND chart_id IS NOT NULL))
  UNIQUE NULLS NOT DISTINCT (user_id, kind, app_id, chart_id)    -- PostgreSQL 15+

alert_rule
  watch_id      bigint PK REFERENCES watch(id)
  preset        text CHECK (preset IN ('IMPORTANT','ALL','CUSTOM')) DEFAULT 'IMPORTANT'
  event_types   text[]  NULL          -- CUSTOM only
  min_places    integer NULL          -- CUSTOM only, 1..200
  tiers         integer[] NULL        -- CUSTOM only, subset of configured tiers
  updated_at    timestamptz
```

- **Settings row:** `setting` key `alerts_seen_at` holds `{"at": "<iso>"}`. A missing row means "never seen" (count from the last 7 days only).
- **Grants:**
    - `app_backend` gets `SELECT, INSERT, UPDATE` on `watch` and `alert_rule`, and `USAGE` on the new sequence.
    - **No `DELETE`.**
    - The collector gets `SELECT` only (or nothing).
- **Indexes:**
    - `watch (active, kind)`;
    - `watch (app_id) WHERE active`;
    - the existing `chart_event (app_id, occurred_at)` and `(chart_id, occurred_at)` indexes cover the joins.

### Backend (package `com.apptracker.watch`)
- **`AlertRule` record + `AlertMatcher`:** a **pure** function `(event, watch, rule, configuredTiers) → boolean`, plus a cooldown function `(ordered alerts) → visible alerts`. Unit-test both like `EventEngineTest`.
- **`WatchRepository`:** NamedParameterJdbcTemplate, as in the rest of the backend.
    - Candidate events come from SQL:
        - events within the period;
        - joined to active watches by app (and by chart when set) or by chart;
        - with `gap = false` and `importance >= 1`.
    - The matcher then applies the rule in Java. Keep it simple: the volume is small (hundreds of events per day).
- **`WatchService`, `WatchController`:**

| Endpoint | Does |
|---|---|
| `GET /api/watch` | Watches with rule, plus per app/chart: current rank, change over `?window=`, 7-day trend, last important event (reuse `QueryRepository` helpers) |
| `POST /api/watch` | Follow `{kind, appleAppId?, chartKey?}`; reactivates an existing row; returns the watch |
| `PUT /api/watch/{id}` | `{active?, rule?: {preset, eventTypes?, minPlaces?, tiers?}}`; 400 with field errors, as in `/api/manage` |
| `GET /api/watch/status?appleAppId=&chartKey=` | Is this app/chart followed (for Follow buttons) |
| `GET /api/alerts?window=7d&app=&chart=&type=&before=&limit=50` | Matching alerts after cooldown, newest first, as `EventRow` plus `watchId` and `isNew`; paging by `before` (occurred_at, id) |
| `GET /api/alerts/count` | `{unread, seenAt}` |
| `POST /api/alerts/seen` | Sets `alerts_seen_at` = now |
| `GET /api/alerts/preview` | Same filters, with a draft rule in the query (or `POST` with a body): count over 7 days + 3 examples, for the rule editor |

- **Protection:** add `/api/watch/**` and `/api/alerts/**` to the admin-key interceptor **for non-GET methods only**. `GET` stays open. The existing `OPTIONS` pass-through stays.
- **`NEW_VERSION` alerts:** a small SQL over `app_metadata_version` using `LAG(version)` per (app, country), mapped to the same `EventRow` shape with type `NEW_VERSION` and the chart set to null. Add the type to the frontend event messages.

### Frontend
- **API layer:** add `watchApi.ts` (reads merged into `trackerApi`; writes like `manageApi`) and `watchTypes.ts`. Only `src/api/*` knows URLs.
- **State:**
    - Reads go through `useResource('watchlist' | 'watchStatus' | 'alerts' | 'alertCount' | 'alertPreview', …)`.
    - Writes reuse the existing mutation mechanism: extend `useMutation` / `manageSaga` with the new ops, and map them in `INVALIDATES` so that following refreshes `watchlist`, `watchStatus` and `alertCount`, and rule changes refresh `alerts` and `alertCount`. Don't create a second, parallel mutation system.
    - A 401 on a write must show the existing admin-key prompt. Make the prompt reachable outside `/settings`: a small modal triggered by `manage.keyRequired`.
- **Domain:** `domain/alerts.ts` holds the preset definitions and validation (mirroring the backend limits), plus hour grouping for the Alerts page. Unit-test it.
- **Components:**
    - `FollowButton`: one reusable component, compact (icon) and labelled variants, with an optimistic toggle and a pending state.
    - `RuleEditor`, `AlertBell`, `AlertList` (reusing the `EventList` row style).
- **Pages:** `pages/WatchlistPage.tsx` and `pages/AlertsPage.tsx`, as lazy routes; menu items "Watchlist" and the bell.
- **i18n:**
    - Every text goes in `en.json` **and** `ar.json`, with all six Arabic plural forms.
    - Arabic needs: alert counts, "N alerts in the last 7 days", hour group labels via `Intl`.
    - The bell count uses Western digits.
- **Fake API:** extend `mock/` with an in-memory fake of `/api/watch` and `/api/alerts`, so `npm run dev:mock` covers the new screens.

### Tests (owner's rule: light, unit tests and migration tests only)
- **Backend unit tests** (`AlertMatcherTest`):
    - each preset;
    - CUSTOM with `minPlaces` and tiers;
    - chart big moments with a tier change in the rules;
    - cooldown (3 h window, different types not merged);
    - de-duplication across overlapping watches;
    - gap events excluded.
- **Migration test** for V4:
    - tables, the CHECK constraint, the unique constraint;
    - the backend role can insert and update but **not delete**.
- **Frontend:**
    - `domain/alerts.test.ts` (presets, validation, grouping);
    - one saga test (a follow invalidates the watchlist and the count);
    - the i18n key test must still pass.

## 3. Build order (stop for review after each)

1. **Watchlist:** V4 migration, the watch endpoints, FollowButton everywhere, My watchlist page, the fake API, tests.
2. **Alert rules + Alerts:** matcher, alert endpoints, rule editor with preview, bell, Alerts page, tests.

Update the READMEs (endpoint tables, screens) and `CLAUDE.md` (sections 5, 7 and 10) when done.

# Milestone 10: Radar (spotting new niches)

The owner requested this on 2026-10-23.

**Keep everything else as it is.** Do not change existing screens, rules, the collector or Milestone 9's scope. The Radar is an **addition**: one new page, one SQL file, and one new read-only backend package.

## 1. Goal

A new niche has no name, no group of similar apps, often no category of its own, and no history. The Radar finds **things that don't fit yet** in data the tracker already collects:

| Data | Where it is |
|---|---|
| Ranks | `ranking`, `snapshot` |
| When the tracker first saw an app | `app.first_seen_at` |
| Release date | `app.release_date` |
| Names and descriptions | `app_listing_version` (name, summary), `app_metadata_version` (description) |
| Developers | `developer` |
| Daily rating counts | `app_rating_daily` |
| Several countries and categories | `chart` |

It shows **why** each item is flagged (reason chips), not just a score.

No new external data source: no Google Trends, no social media, no Apple search API in v1.

**Collection interval:** the default is 12 hours (section 1), so the Radar must reason in **time** (days), not in a fixed number of readings. Where a rule needs readings, it counts the VALID readings actually present in the period, whatever the interval.

## 2. The Radar page (`/radar`, new menu item "Radar")

### Top bar (reuse existing components)
- **Country:** default `ph`.
- **Scope:** all tracked categories in that country (default), or one category.
- **Period:** 7D / 14D (default) / 30D.
- **Toggle:** "Hide known themes" (on by default).

### Five sections, each a `Panel`

**1. Newcomers.** Apps that are new **and** gaining.
- **Who appears:**
    - first seen by the tracker within the period, **or** released by Apple within the last 90 days;
    - currently ranked in at least one active chart of the scope.
- **Each row shows:**
    - app (icon, name, developer), best current rank and chart;
    - rank change over the period;
    - rating-count growth over 7 days (absolute and %);
    - age in days;
    - reason chips.
- **Sorting:** by radar score (see §3).

**2. Rising from the bottom.**
- Apps that were in the **bottom half** of a chart's depth (e.g. ranks 51–100 for depth 100) at the start of the period and are now in the **top half**.
- Their rank must also improve in **at least 60% of the steps** between consecutive VALID readings in the period (steady, not one jump), with at least 4 readings.
- These are often new kinds of apps before anyone notices.

**3. Emerging words.** New vocabulary.
- **The words:** taken from the name and the summary/subtitle of apps **first seen within the period**, compared with apps first seen in the 60 days before.
- **A word is flagged when all of these hold:**
    - it appears in **≥ 3 new apps** from **≥ 2 different developers**;
    - it appeared in **≤ 1 app** in the baseline;
    - it is not a stop word and not part of a known theme (when "Hide known themes" is on).
- **Each word row shows:**
    - the word;
    - the number of new apps and developers;
    - its first appearance;
    - the apps, as small icons linking to their pages.
- **Action:** "Save as theme" (see §4).

**4. Possible new niches.** Clusters.
- **What a cluster is:**
    - one **originator**: the app with that word, or a similar name, that was seen first;
    - its **followers**: other apps from **other developers**, first seen after the originator, within the period plus 30 days.
- **Similar name:** shares a rare word (an emerging word, or a word used by ≤ 2 apps overall), or the normalised names are close (Jaro-Winkler ≥ 0.9 after removing stop words).
- **When a cluster shows:** only with **at least 2 followers**. The rule of thumb is "one app is a hit; the copies make the niche".
- **Each cluster card shows:**
    - the originator and its rank history as a sparkline;
    - the followers;
    - the total rank gained;
    - the combined rating growth;
    - the number of countries it ranks in.

**5. Seen abroad, not here yet.**
- **Who appears:** apps (and emerging words) ranked in the **Top 25** of a tracked chart in **another enabled country**, in a category also tracked in the selected country, that have **never ranked** in the selected country.
- **Each row shows:** the app, where it ranks and since when, and the countries it ranks in.
- **When only one country is enabled:** show an empty state that explains how to enable more (link to Settings → Countries) and mentions `collector/db/activate-us.sql`.

### On every app row
- A link to the app page.
- A **Dismiss** button (hide from the Radar; reversible from "Show dismissed").
- If Milestone 9 is built, the existing `FollowButton`. Don't build follow logic here.

### States
- **Loading:** skeletons.
- **Empty, per section:** explain what would make the section fill up, e.g. "Not enough history yet: the Radar needs about 2 weeks of collection".
- **Errors:** the existing `ErrorState`.

## 3. Radar score and reasons (pure functions, unit tested)

Each candidate app gets **reasons**, and a score that is simply the sum of their points. Points are constants in one place, so they are easy to tune later.

| Reason (chip) | Condition | Points |
|---|---|---|
| `NEW_APP` | released ≤ 90 days ago | 2 |
| `NEW_IN_CHARTS` | first seen by the tracker within the period | 2 |
| `CLIMBING` | gained ≥ 10 places over the period (or bottom → top half) | 2 |
| `STEADY` | rank improved in ≥ 60% of the steps in the period (≥ 4 readings) | 1 |
| `RATINGS_GROWING` | rating count +≥ 30% over 7 days and +≥ 20 ratings | 2 |
| `RATINGS_FAST` | rating growth in the top 10% of ranked apps in the scope | 1 |
| `UNKNOWN_THEME` | name/summary matches no known theme | 2 |
| `HAS_FOLLOWERS` | is the originator of a cluster with ≥ 2 followers | 3 |
| `MULTI_COUNTRY` | ranks in ≥ 2 enabled countries | 1 |
| `NEW_DEVELOPER` | developer's first app seen by the tracker | 1 |

**Rules:**
- Hide apps with score < 4 by default; a "Show all" link reveals them.
- **Ignore readings flagged as gaps** (after outages), and only use VALID snapshots.
- **Ratings growth** needs at least 2 daily rows. Without them, the reason simply doesn't apply (no error).

## 4. Themes (known niches)

"Unknown theme" needs a list of known themes.

- **The list:** themes are a name plus keywords, managed in a **Themes** tab on the Radar page itself. **Do not add it to Settings.**
- **Seed themes:**
    - Tongits (`tongits`)
    - Pusoy (`pusoy`, `pusoy dos`)
    - Slots (`slot`, `slots`)
    - Bingo (`bingo`)
    - Poker (`poker`, `texas`, `holdem`)
    - Mahjong (`mahjong`)
    - Sabong (`sabong`)
    - Ludo (`ludo`)
    - Domino (`domino`, `dominoes`)
    - Chess (`chess`)
    - Solitaire (`solitaire`)
    - Lucky 9 (`lucky 9`, `lucky nine`)
    - Sakla (`sakla`)
    - Color game (`color game`, `perya`)
- **"Save as theme"** from an emerging word creates a theme with that word. The word then disappears from "Emerging words" when "Hide known themes" is on.
- **Themes are switched off, never deleted.**

### Words and stop words (pure helper, unit tested)
- **Lowercase**, remove accents, split on anything that isn't a letter or digit. Use a Unicode-aware split, because names can be Filipino, English, Arabic or other scripts.
- **Drop:** words of 2 characters or fewer, pure numbers and years.
- **Stop words:** English and Filipino/Tagalog, plus generic app words: `game`, `games`, `online`, `offline`, `free`, `pro`, `plus`, `app`, `new`, `best`, `real`, `classic`, `card`, `casino`, `ng`, `sa`, `ang`, `mga`, `laro`…
    - Keep the list in one file.
    - Category names are stop words too: a word that is just the category isn't news.
- **Plurals:** treat `slot`/`slots` as one word with simple `s` stemming. Nothing more clever.

## 5. Technical design

### Schema: `backend/db/radar.sql` (plain SQL run by the admin, like `management.sql`; there is no Flyway)
Make it **safe to run again**: `CREATE TABLE IF NOT EXISTS`, seed with `ON CONFLICT (name) DO NOTHING`, grants repeated harmlessly.

```
radar_theme
  id          bigint identity PK
  name        text NOT NULL UNIQUE
  keywords    text[] NOT NULL
  active      boolean NOT NULL DEFAULT true
  created_at, updated_at timestamptz

radar_dismissal
  app_id      bigint PK REFERENCES app(id)
  active      boolean NOT NULL DEFAULT true   -- "undismiss" sets false
  created_at, updated_at timestamptz
```
- **Seed** the themes from §4.
- **Grants:** `app_backend` gets `SELECT, INSERT, UPDATE` on both tables and the sequence. **No `DELETE`.**
- **Where it runs:** add `radar.sql` to the list of scripts in `DEPLOY.md` (section 8) and section 8 of this file, after `management.sql`.

### Backend (package `com.apptracker.radar`, read-mostly)
- **`RadarRepository`:** NamedParameterJdbcTemplate.
    - Candidates: apps ranked in the scope's active charts within the period, with their first/last ranks, reading counts, `release_date`, `first_seen_at`, developer, latest name/summary, and rating counts at the start and end (`app_rating_daily`).
    - Keep it to a few set-based queries, not one per app.
- **Pure helpers, unit tested:**
    - `Words` (tokenise, stop words, stemming);
    - `RadarScorer` (reasons and score);
    - `EmergingWords`;
    - `Clusters` (originator, followers, Jaro-Winkler);
    - `AbroadNotHere`.
- **`RadarService`:**
    - Computes the whole Radar for (country, scope, period) **at read time**, like M9's alerts.
    - Caches the result for 10 minutes per parameter set (a simple in-memory map with timestamps is enough).
    - The data changes at most hourly, and the volume is small: hundreds of apps.
- **`RadarController`:**

| Endpoint | Returns / does |
|---|---|
| `GET /api/radar?country=ph&genre=&window=14d&hideKnown=true&showDismissed=false&minScore=4` | `{newcomers[], risingFromBottom[], emergingWords[], clusters[], abroad[], dataSince, notes[]}`. Rows reuse the existing `AppCard`; each row has `reasons[]`, `score`, and the numbers shown in §2 |
| `GET /api/radar/themes` · `POST` · `PUT /api/radar/themes/{id}` | Themes: list, create `{name, keywords}`, change `{name?, keywords?, active?}` |
| `POST /api/radar/dismiss` `{appleAppId, active}` | Dismiss / undismiss |

- **Validation:** 400 with field errors, as in `/api/manage`.
- **Protection:** like Settings. Add `/api/radar/**` to the admin-key interceptor for **non-GET methods only**; `GET` stays open.
- **`dataSince`:** the first VALID snapshot in the scope. The frontend uses it to say "not enough history yet" when it is less than 7 days ago.

### Frontend
- **API layer:** `api/radarApi.ts` + `api/radarTypes.ts`. Reads are merged into `trackerApi`; writes go through the existing `useMutation`/`manageSaga` mechanism, with `INVALIDATES` entries. Only `src/api/*` knows URLs.
- **Domain:** `domain/radar.ts` holds the reason-chip definitions (label key, tone, order), the "not enough history" rule and the sorting. Unit-test it.
- **Components:**
    - `ReasonChips`;
    - `RadarAppRow` (reuses `AppLabel`, `Sparkline`, `RankDelta`);
    - `WordRow`;
    - `ClusterCard`;
    - `ThemeEditor`, for the Themes tab: list with switches, add a theme, edit keywords as chips.
- **Page:** `pages/RadarPage.tsx`, a lazy route; it has two tabs, Radar and Themes.
- **i18n:**
    - Every text in `en.json` **and** `ar.json`, with full Arabic plurals: "N new apps", "N developers", "N followers", "N countries", ages in days.
    - Words and app names keep `dir="auto"`.
- **Fake API:** extend `mock/` with a plausible `/api/radar` response built from the existing fixtures, plus an in-memory fake of themes and dismissals, so `npm run dev:mock` shows every section filled. Include at least one cluster, one emerging word, and the "abroad" empty state.

### Tests (owner's rule: light, unit tests and migration tests only)
- **Backend:**
    - `WordsTest`: tokenising, stop words, `s` stemming, non-Latin names.
    - `RadarScorerTest`: each reason, thresholds, missing ratings, a 12-hour interval.
    - `EmergingWordsTest`: ≥ 3 apps / ≥ 2 developers / baseline ≤ 1, and the known-theme filter.
    - `ClustersTest`: originator order, followers from other developers only, the minimum of 2 followers.
- **Migration test** for `radar.sql`:
    - running it twice works;
    - the seed themes are present;
    - the backend role can insert and update but **not delete**.
- **Frontend:** `domain/radar.test.ts`; the i18n key test must still pass.

## 6. Build order (stop for review after each)

1. **Backend + `radar.sql`:** helpers and tests first, then the repository, service and endpoints. Check the endpoint against the real database: numbers make sense, response time under 1 s.
2. **Frontend:** the Radar tab (five sections), the Themes tab, the fake API, both languages.

When done, update the READMEs (endpoint tables, screens), `DEPLOY.md` (the script list) and this file (sections 3, 5, 7, 8 and 10).

## 7. Out of scope for v1

Do not build these; they are noted here for later:
- external signals (Google Trends, social, ad libraries);
- Apple keyword search to measure supply;
- review-text analysis;
- radar alerts (they could plug into M9's alert rules later).
