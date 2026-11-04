# Deployment guide

**Recommended shape:** ONE web service (the Docker image: API + website) + ONE managed PostgreSQL + Cloudinary. One domain means no CORS problems, simple cookies, and `/sitemap.xml` + `/robots.txt` at the site root.
Docker image: see `Dockerfile` (**not build-tested in the authoring sandbox**: run the first build yourself and read any error carefully).

## Hosting choice and costs (verify current prices)
* The host must run **Python web services or Docker containers** and offer **managed PostgreSQL**. Examples that do: Render, Railway, Fly.io, or your own VPS (Docker + Caddy/nginx).
* Example, **Render** (researched Oct 2026, prices change: check render.com/pricing): web service instance from about **$7/month** (always-on) and managed PostgreSQL billed separately (sources I found disagreed on the exact entry price and on how long the free database lasts: treat the free database as temporary). **Free web instances go to sleep when idle and the free database expires, so do not use the free tier for a real shop.**
* Cloudinary has a free tier with monthly limits; check cloudinary.com/pricing against your expected image traffic.
* Choose a server region close to your customers (check the provider's regions; Europe or Africa-adjacent regions generally give lower latency to Cameroon than the US).
* Payment fees depend entirely on your provider.
* Realistic starting budget: hosting + database ≈ the two prices above, plus your domain name (~$10-20/year) and payment fees.

## Build commands
```bash
# Website (only needed if you do NOT use Docker)
cd frontend && npm ci && npm run build            # output: frontend/dist
# Backend start command (the Docker CMD does the same; run from backend/)
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
# Without Docker, to serve the website from FastAPI:  FRONTEND_DIST=/path/to/frontend/dist
```
`--forwarded-allow-ips='*'` is only safe when the app is reachable **only** through the host's proxy (true on Render/Railway/Fly). On a VPS use your proxy's IP instead.

## Environment variable checklist (set in the host's dashboard, NOT in files)
| Variable | Value |
|---|---|
| `APP_ENV` | `production` (the app **refuses to start** with unsafe settings) |
| `DATABASE_URL` | from the managed database (`postgres://…` is accepted and converted) |
| `SECRET_KEY` | 32+ random characters (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |
| `COOKIE_SECURE` | `true` |
| `SITE_URL`, `FRONTEND_ORIGIN` | `https://your-domain` (same value, no trailing slash) |
| `FRONTEND_DIST` | set by the Docker image (`/app/frontend_dist`) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | from Cloudinary |
| `PAYMENT_MODE`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` | `test`/`test` until a real adapter exists; live needs all three |
| `CURRENCY`, `TAX_RATE_PERCENT`, `SHIPPING_*`, `SHIPPING_COUNTRIES` | your store rules |
| `SMTP_*`, `EMAIL_FROM` | optional, for emails |
| `WEB_CONCURRENCY` | `1` to start (the rate limiter is per-process; see Security) |
Build-time (Docker `--build-arg`): `VITE_SITE_NAME`, `VITE_CONTACT_EMAIL`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_ADDRESS`, `VITE_HERO_IMAGE_URL`.
**Never** put secrets in any `VITE_*` variable: they are visible to everyone.

## Steps
1. Create the managed PostgreSQL; copy its connection URL.
2. Create the web service from your Git repo using the `Dockerfile` (build context = repo root). Add the variables above.
3. First deploy runs `alembic upgrade head` automatically (creates tables).
4. Create your admin: open the service's **shell/console** and run `python -m app.cli create-admin --email you@your-domain` (do **not** run `app.seed` in production: it refuses).
5. Add your domain in the host's dashboard; it issues the **HTTPS certificate**. Set DNS records exactly as the host instructs. Confirm `https://your-domain/api/health` works.
6. Log in at `/admin/login`, add categories/bikes/images. Place a test order (test mode).
7. Schedule `python -m app.cli release-expired` every ~15 minutes (host cron job) to free stock of abandoned unpaid orders. (It also runs on every checkout.)

## HTTPS, CORS, domains
* HTTPS is provided by the host/proxy. The app sets `Strict-Transport-Security` and secure cookies when `COOKIE_SECURE=true`. Test: cookies appear with the Secure flag and login works.
* Single-domain deployment needs no extra CORS. If you ever host the website separately, set `FRONTEND_ORIGIN` to its exact origin and build the site with `VITE_API_URL=https://api.your-domain` (keep both under the same registrable domain so cookies stay first-party).

## Health checks, logs, monitoring
* Liveness `GET /api/health`; readiness (checks the database) `GET /api/health/ready`. Point the host's health check at `/api/health/ready`.
* Logs go to stdout (view in the host dashboard). The admin **Audit log** page records logins, product/stock/order changes and payment events.
* Recommended additions: uptime monitor (e.g. UptimeRobot) on `/api/health/ready`; an error tracker (e.g. Sentry) if you want alerts.

## Backups
* Turn on the managed database's **automatic backups** and note the retention period. Confirm you can **restore** one into a scratch database.
* Manual copy: `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump` (restore with `pg_restore -d NEW_DB_URL backup.dump`).
* Images live in Cloudinary: keep your originals, or export from Cloudinary's dashboard periodically.

## Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| App exits with "Unsafe production configuration" | Fix the listed variable (`SECRET_KEY`, `COOKIE_SECURE`, …) |
| "Security check failed. Please refresh" (403) | Cookies blocked, or `FRONTEND_ORIGIN` ≠ the address in the browser bar |
| Login works then immediately logs out | `COOKIE_SECURE=true` but site opened over plain `http://` |
| Uploads say "not configured" (503) | Missing Cloudinary variables; restart after setting |
| "connection refused" / DB errors | Wrong `DATABASE_URL`, database not running, or IP/network rules |
| `alembic` errors | Run from `backend/`; `DATABASE_URL` must be set; never edit applied migrations |
| Orders stuck "Awaiting payment" | Webhook not reaching `/api/webhooks/payments/<provider>` or wrong `PAYMENT_WEBHOOK_SECRET`; check logs for "Rejected payment webhook" |
| Port already in use | Stop the other process or choose another `--port` |
