# App Store ranking tracker

Tracks Apple App Store chart rankings every 12 hours (configurable per category), keeps the full history, and turns it into events and an API for a dashboard.

```
app-tracker/
├── collector/          Node.js: fetches charts from Apple on schedule, stores history (milestones 1–3)
├── backend/            Spring Boot (Java 17): app details, ranking events, REST API (milestones 4–6)
├── frontend/           React web app in English and Arabic: dashboard, app pages and Settings (milestones 7–8)
├── docker-compose.yml  collector + backend + web app (the database runs elsewhere)
├── .env.example        database logins and settings
└── DEPLOY.md           step-by-step deployment on a Linux server
```

## Start everything

Each part runs in its own container. By default they use the existing database named in `.env`:

```bash
cp .env.example .env          # database logins, ADMIN_KEY, USER_AGENT
docker compose up -d --build
docker compose logs -f collector backend
```

To deploy on a server (HTTPS, firewall, backups), follow [DEPLOY.md](DEPLOY.md).

The database is not in Docker. A new database is set up once with the SQL scripts (DEPLOY.md section 8), which create the tables, the starting configuration (Board, Card, Casino · Top Free · Philippines) and three users:

| User | Used by | Can |
|---|---|---|
| `apptracker` | you, schema changes | everything |
| `app_collector` | collector | add rankings and history; cannot change configuration or delete |
| `app_backend` | backend | read everything; write details, ratings and events; add and switch configuration from Settings (never delete) |

Then:

- the collector stores a reading of each chart every 12 hours (00:00 and 12:00 UTC);
- the backend turns each reading into events within a minute, and looks up app details within minutes;
- the API answers on http://localhost:8080/api (docs: http://localhost:8080/swagger-ui.html);
- the web app runs on http://localhost:3000; its Settings menu (http://localhost:3000/settings) changes countries, categories, intervals and event rules, and shows collection health.

```bash
curl http://localhost:8080/api/charts
curl http://localhost:8080/api/charts/ph/7006/top-free/ranking
curl http://localhost:8080/api/charts/ph/7006/top-free/headlines
```

**Existing database** (created before the Settings menu, the watchlist or the Radar): run the backend's table scripts once as the admin. The last three are safe to run again:

```bash
psql "$ADMIN_DATABASE_URL" -f backend/db/schema.sql       # only if the backend tables do not exist yet
psql "$ADMIN_DATABASE_URL" -f backend/db/management.sql
psql "$ADMIN_DATABASE_URL" -f backend/db/watchlist.sql
psql "$ADMIN_DATABASE_URL" -f backend/db/radar.sql
```

Configuration from SQL (countries, categories, chart types) and backups: see `collector/README.md`. API, rules and admin actions: see `backend/README.md`. The web app (development with a fake API, separate deployment, languages): see `frontend/README.md`.
