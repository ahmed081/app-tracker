# Deploying on a Linux server with Docker

Three containers, built from this repository:

| Container | Image | Listens on | Role |
|---|---|---|---|
| `collector` | `app-tracker-collector` | nothing | Reads the Apple charts, writes the history |
| `backend` | `app-tracker-backend` | `BACKEND_BIND` (default `127.0.0.1:8082`, server only) | API, event engine, app details |
| `frontend` | `app-tracker-frontend` | `FRONTEND_BIND` (default `127.0.0.1:8083`) | The web app; Nginx forwards `/api` to the backend |

The database is **not** in a container by default. All three use the PostgreSQL named in `.env`, which is the existing `app_tracker_db` today. A fourth container with a new, empty database is available with `--profile local-db` (section 8).

```
browser ──HTTPS──► Caddy (host, :443) ──► frontend :8083 ──/api──► backend :8082 ──┐
                                                                  collector ───────┴──► PostgreSQL
```

## 1. What the server needs

- **Linux:** Ubuntu 22.04/24.04 or Debian 12, 64-bit.
- **Memory:** 2 GB RAM or more. The backend image is compiled on the server with Maven, which is the heaviest step. Running all three takes about 700 MB.
- **Disk:** 5 GB free.
- **Network:** outgoing access to `itunes.apple.com` and to the database (port 5432).
- **Domain (optional):** a domain name pointing at the server, for HTTPS.

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out and back in
docker compose version             # needs v2.20 or newer
```

## 3. Copy the project to the server

`.env` is git-ignored, so it never travels with the code. Copy it separately, as shown below.

**Option A: a private Git repository (recommended; updates become `git pull`).**

On your PC:
```bash
git add -A && git commit -m "Docker deployment"
git remote add origin git@github.com:YOU/app-tracker.git    # a PRIVATE repository
git push -u origin main
```

On the server:
```bash
git clone git@github.com:YOU/app-tracker.git ~/app-tracker
```

**Option B: copy an archive (no Git hosting).**

On your PC, from the project folder in Git Bash. Commit first, because `git archive` only takes committed files.
```bash
git archive --format=tar.gz -o app-tracker.tar.gz HEAD
scp app-tracker.tar.gz user@SERVER:~
ssh user@SERVER 'mkdir -p ~/app-tracker && tar -xzf ~/app-tracker.tar.gz -C ~/app-tracker'
```

**Then, in both cases, copy `.env`:**
```bash
scp .env user@SERVER:~/app-tracker/.env
ssh user@SERVER 'chmod 600 ~/app-tracker/.env'
```

## 4. The `.env` file

`.env` in the project root is already filled in from your local settings. `.env.example` lists every variable with comments.

| Variable | What it is |
|---|---|
| `COLLECTOR_DATABASE_URL` | The collector's login, as `postgres://user:password@host:5432/db`. Symbols in the password must be URL-encoded. |
| `BACKEND_JDBC_URL` | `jdbc:postgresql://host:5432/db`, without a password. |
| `BACKEND_DB_USER` / `BACKEND_DB_PASSWORD` | The backend's login. The password is written as is, not encoded. |
| `ADMIN_KEY` | Protects the Settings menu. A random key was generated. The web app asks for it the first time you save something in Settings. Empty means anyone who can open the site can change the settings. |
| `USER_AGENT` | Sent to Apple with every request. Keep a contact address in it. |
| `CORS_ORIGINS` | Only needed if a web app on another address calls the API directly. |
| `BACKEND_JAVA_OPTS` | Backend memory, `-Xmx512m` by default. |
| `FRONTEND_BIND` | `127.0.0.1:8083` behind Caddy (section 6), or `8083` (or `80`) for plain HTTP without a domain. |
| `BACKEND_BIND` | `127.0.0.1:8082`: the API on the server only, for checks. Inside Docker the backend always uses 8080. |
| `POSTGRES_PASSWORD`, `COLLECTOR_PASSWORD`, `BACKEND_PASSWORD` | Only for `--profile local-db`. |

If a value contains `$`, `#` or spaces, keep it in single quotes, as `.env` already does.

## 5. Start

**Stop your local collector and backend first.** They must not run against the same database as the server:
- A second collector refuses to start: "Another collector is already running". It would restart in a loop.
- Two backends would both turn readings into events, which creates duplicate events.

Then, on the server:
```bash
cd ~/app-tracker
docker compose up -d --build            # first build: about 5–10 minutes
docker compose ps                       # all three "running"
docker compose logs -f collector backend
```

**Check the services:**
```bash
curl -s localhost:8082/actuator/health          # {"status":"UP"}
curl -s localhost:8083/api/charts | head -c 300 # the API, through the web app's Nginx
```

**Expected logs:**
- The collector logs `collector started`, then one line per chart it reads.
- The backend logs `Started ...Application`.

`restart: unless-stopped` brings all three back after a crash or a server reboot.

## 6. Open it to the internet

### With a domain and HTTPS (recommended)

1. Point the domain's DNS `A` record at the server's IP.
2. Keep `FRONTEND_BIND=127.0.0.1:8083` in `.env`.
3. Install Caddy on the server itself, not in Docker. Caddy fetches the certificate and renews it automatically:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
rankline.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8083
}
EOF
sudo systemctl reload caddy
```

Open `https://rankline.example.com`.

### Without a domain (plain HTTP, for a quick test)

Set `FRONTEND_BIND=8083` in `.env`, run `docker compose up -d`, and open `http://SERVER-IP:8083` (allow it in the firewall: `sudo ufw allow 8083/tcp`). The admin key travels in clear text over HTTP, so switch to a domain before relying on it.

### Firewall

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

Ports that Docker publishes skip `ufw`. That is why the backend and the web app listen on `127.0.0.1` only, unless you set `FRONTEND_BIND=8083` (or `80`).

## 7. The database

The schema already exists in `app_tracker_db`, so there is nothing to run.

**If PostgreSQL runs on the same server:**
- The containers reach it through the server's IP, as in `.env`.
- PostgreSQL must listen on that address (`listen_addresses` in `postgresql.conf`).
- `pg_hba.conf` must allow the Docker network:
  ```
  host  app_tracker_db  app_tracker_user  172.16.0.0/12  scram-sha-256
  ```
- Then `sudo systemctl reload postgresql`.

**If PostgreSQL is reachable from the internet on port 5432:** close that port to everything except the servers that need it. Use `ufw` on the database server, or your provider's firewall.

**Backups.** A daily dump, keeping 14 days. Add it to the server's crontab with `crontab -e`:
```
30 3 * * * cd ~/app-tracker && mkdir -p backups && docker compose --profile tools run --rm -T backup > backups/db-$(date +\%F).dump && find backups -name 'db-*.dump' -mtime +14 -delete
```
Try it once by hand first: `docker compose --profile tools run --rm -T backup > backups/test.dump && ls -lh backups`.
To restore: `pg_restore --clean --if-exists -d <url> backups/db-YYYY-MM-DD.dump`.

## 8. Option: a new database in Docker

This gives a fresh, empty database with the least-privilege users `app_collector` and `app_backend`.

1. In `.env`, set the three passwords. Use letters, digits, `-` and `_` only.
2. Point the logins at the `postgres` container:
   ```
   POSTGRES_PASSWORD=...
   COLLECTOR_PASSWORD=pw-c
   BACKEND_PASSWORD=pw-b
   COLLECTOR_DATABASE_URL=postgres://app_collector:pw-c@postgres:5432/apptracker
   BACKEND_JDBC_URL=jdbc:postgresql://postgres:5432/apptracker
   BACKEND_DB_USER=app_backend
   BACKEND_DB_PASSWORD=pw-b
   ```
3. Start everything with the profile:
   ```bash
   docker compose --profile local-db up -d --build
   ```

On the first start, Postgres creates the tables, the starting configuration (PH Board/Card/Casino) and the two users. **Always use the same `--profile local-db` flag** for later commands, or Compose leaves that container out.

## 9. Everyday commands

```bash
docker compose ps                         # status
docker compose logs -f --tail=100 backend # logs (also: collector, frontend)
docker compose restart backend            # restart one service
docker compose down                       # stop everything (the data stays in the database)
```

**Update to a new version:**
```bash
git pull                                  # or copy a new archive (section 3)
docker compose up -d --build              # rebuilds and restarts only what changed
docker image prune -f                     # remove old images
```

After an update that changes SQL files in `collector/db/` or `backend/db/`, apply them by hand as the database owner. The app never changes the schema itself.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `set COLLECTOR_DATABASE_URL in .env` | `.env` is missing or not in the folder where you run `docker compose`. |
| Backend `Connection refused` / `timeout` to the database | Firewall, `listen_addresses` or `pg_hba.conf` (section 7). Test it with `docker run --rm postgres:16 pg_isready -h HOST -p 5432`. |
| Backend `password authentication failed` | `BACKEND_DB_PASSWORD` is wrong, or has a `$` without single quotes. |
| Collector `Another collector is already running` | Another collector uses the same database, maybe the one on your PC. Stop it. |
| Collector `password authentication failed` but the backend works | A symbol in the password is not URL-encoded in `COLLECTOR_DATABASE_URL`. |
| `Bind for 0.0.0.0:8082 failed: port is already allocated` | Another program or container uses that port. Find it with `sudo ss -ltnp | grep :8082` and `docker ps --format '{{.Names}} {{.Ports}}'`, then pick a free port in `BACKEND_BIND` / `FRONTEND_BIND`. |
| Web app shows "Couldn't load" everywhere | Look at `docker compose logs backend`. The web app only forwards `/api` to the backend. |
| Settings asks for a key | Enter `ADMIN_KEY` from `.env`. The browser keeps it until the tab is closed. |
| Build stops with `Killed` | Not enough memory to build the backend. Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |
