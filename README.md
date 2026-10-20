# App Store ranking tracker

Tracks Apple App Store chart rankings every hour, keeps the full history, and turns it into events and an API for a dashboard.

```
app-tracker/
├── collector/          Node.js: fetches charts from Apple every hour, stores history (milestones 1–3)
├── backend/            Spring Boot (Java 17): app details, ranking events, REST API (milestones 4–6)
├── frontend/           React web app in English and Arabic: dashboard and app pages (milestones 7–8)
├── docker-compose.yml  PostgreSQL + collector + backend + web app
└── .env.example        passwords and settings
```

## Start everything

```bash
cp .env.example .env          # set the passwords, ADMIN_KEY and USER_AGENT
docker compose up -d --build
docker compose logs -f collector backend
```

On the first start the database is created with the tables, the starting configuration (Board, Card, Casino · Top Free · Philippines) and three users:

| User | Used by | Can |
|---|---|---|
| `apptracker` | you, schema changes | everything |
| `app_collector` | collector | add rankings and history; cannot change configuration or delete |
| `app_backend` | backend | read everything; write only details, ratings and events |

Then:

- the collector stores a reading of each chart every hour;
- the backend turns each reading into events within a minute, and looks up app details within minutes;
- the API answers on http://localhost:8080/api (docs: http://localhost:8080/swagger-ui.html);
- the web app runs on http://localhost:3000.

```bash
curl http://localhost:8080/api/charts
curl http://localhost:8080/api/charts/ph/7006/top-free/ranking
curl http://localhost:8080/api/charts/ph/7006/top-free/headlines
```

Configuration (countries, categories, chart types) and backups: see `collector/README.md`. API, rules and admin actions: see `backend/README.md`. The web app (development with a fake API, separate deployment, languages): see `frontend/README.md`.
