# VoltRide: Electric Bicycle Store (React + FastAPI + PostgreSQL)

A real full-stack shop: customers browse bikes, add to cart, check out and pay; administrators manage products, images, stock and orders.

| Part | Technology | Folder |
|---|---|---|
| Website | React 19, TypeScript, Vite, Tailwind CSS | `frontend/` |
| API | Python, FastAPI, SQLAlchemy 2, Pydantic | `backend/` |
| Database | PostgreSQL + Alembic migrations | `backend/alembic/` |
| Images | Cloudinary (keys stay on the server) | `backend/app/services/storage.py` |

> **Honest status:** read [`docs/STATUS.md`](docs/STATUS.md). It lists what was tested, what needs *your* credentials (Cloudinary, a real payment provider, email, hosting) and what is unfinished. Payments run in **TEST MODE** (simulated, no money moves) until you connect a real provider.

```
Browser ──► FastAPI (/api/*, also serves the built website in production) ──► PostgreSQL
                         ├──► Cloudinary (product images)
                         └──► Payment provider (webhook, signed)
```

---
## 1. Run it on your computer (first time)

**You need:** Node.js 20+, Python 3.11+, Git, and PostgreSQL 15+ (*or* use the no-install helper in step 2).
Every command below says which folder to run it in. Open **three terminal windows**.

### Step 1: get the code and install the backend (Terminal 1)
```bash
cd ebike-store/backend                 # the "backend" folder inside the project
python3 -m venv .venv                  # creates a private Python environment
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt    # installs everything (dev = includes test tools)
cp .env.example .env                   # Windows: copy .env.example .env
```

### Step 2: database
**Option A: PostgreSQL you installed.** Create an empty database and a user, then put the URL in `backend/.env`:
```bash
psql -U postgres -c "CREATE USER ebike WITH PASSWORD 'choose-a-password';"
psql -U postgres -c "CREATE DATABASE ebike_store OWNER ebike;"
```
`.env` line: `DATABASE_URL=postgresql+psycopg://ebike:choose-a-password@localhost:5432/ebike_store`

**Option B: no PostgreSQL installed (development only).** In a *separate* terminal (Terminal 0), from `ebike-store/backend` with the venv active, run `python scripts/dev_db.py`, leave it open, and copy the `DATABASE_URL=...` line it prints into `backend/.env`.

Also set a secret in `backend/.env`:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"      # paste the output after SECRET_KEY=
```

### Step 3: create the tables, add demo bikes, create your admin (Terminal 1, `backend/`)
```bash
alembic upgrade head                   # creates all tables (migrations)
python -m app.seed                     # OPTIONAL demo categories + 8 demo bikes (no photos)
python -m app.cli create-admin --email you@example.com    # asks you to type a password (min 12 chars)
uvicorn app.main:app --reload --port 8000                 # starts the API
```
Check: open http://localhost:8000/api/health → `{"status":"ok"}`. API docs (development only): http://localhost:8000/docs

### Step 4: start the website (Terminal 2, `frontend/`)
```bash
cd ebike-store/frontend
npm install
npm run dev
```
Open **http://localhost:5173**.  (Vite forwards `/api` to the backend, so it behaves like one website.)

### Step 5: test every page
| Page | URL | What to check |
|---|---|---|
| Home | `/` | hero, featured bikes, categories, FAQ, newsletter (stores your email in the DB). Reviews section appears only after real approved reviews exist |
| Shop | `/shop` | search, category/price/range filters, sorting, pagination, empty state (search `zzzz`) |
| Product | click a bike | specs, quantity, add to cart; unknown slug `/product/nope` shows "not found" |
| Cart | `/cart` | change quantity, remove, try more than stock (message), empty state |
| Checkout | `/checkout` | submit empty (validation), fill in, **Place order & pay** → test payment page |
| Test payment | automatic | **Simulate successful payment** → order shows "Payment verified". Try **failed** on another order: it is cancelled and stock returns |
| Register / Login | `/register`, `/login` | weak password message, wrong password message |
| Account / orders | `/account`, `/account/orders` | profile, addresses, order history, tracking |
| Admin | `/admin/login` | sign in with the admin you created; customers are refused |

---
## 2. Use the admin dashboard (no code editing)

1. Open **http://localhost:5173/admin/login** and sign in with the email/password from `create-admin`.
2. **Categories → Add category** (e.g. Mountain, Commuter, Folding, Fat-tire, Road, Cargo). *(Skip if you ran the demo seed.)*
3. **Products → Add bike.** Fill in name, SKU, price (whole XAF), stock, category and specs → **Create bike**.
4. You land on the edit page. Under **Images**: **Choose images** → check previews → **Upload** (progress bars show). Mark one **Primary**, reorder with ◀ ▶, **Remove** extras. *(Needs Cloudinary: next section. Without it you see a clear "not configured" message, never a fake success.)*
5. Tick **Published** (and **Featured on the homepage** if you like) → **Save changes**. Use **Preview** any time before publishing.
6. **Inventory** to add stock (deliveries) or correct counts (a reason is required and logged). **Orders** to search, filter, add tracking, mark shipped/delivered, **Export CSV**.

Delete the demo bikes when you are ready (Products → Delete).

### Cloudinary setup (image uploads)
1. Create a free account at cloudinary.com. 2. On the dashboard copy **Cloud name**, **API Key**, **API Secret**.
3. Put them in `backend/.env` (`CLOUDINARY_CLOUD_NAME=`, `CLOUDINARY_API_KEY=`, `CLOUDINARY_API_SECRET=`). 4. Restart `uvicorn`.
The secret never reaches the browser. The server checks real file content (JPEG/PNG/WebP only), enforces `MAX_UPLOAD_MB`, and strips photo metadata (GPS/camera) before uploading.

---
## 3. Payments (read this before going live)

* **Now: test mode.** `PAYMENT_MODE=test` uses a built-in simulator. The website shows "TEST MODE" banners. The simulator feeds a **signed webhook** through the exact code path a real provider would use. An order becomes *Paid* only there. Visiting a success page never marks anything paid.
* **Cameroon:** Stripe does not offer merchant accounts to businesses based in Cameroon (its Cameroon page only covers tax for digital services). Flutterwave publicly reports a Cameroon payments licence and MTN MoMo support, so it is a candidate, as are local aggregators (e.g. CinetPay, Campay, DusuPay). **Confirm with the provider that *your* business can be onboarded, which methods you get (MTN MoMo, Orange Money, cards), fees and settlement time before relying on it.**
* **No real provider is integrated yet.** Adding one is a small, well-defined job: write an adapter with two methods in `backend/app/services/payments.py`:
  `create_payment(order, payment) -> {"provider_ref", "checkout_url"}` and `verify_and_parse(headers, body) -> PaymentEvent` (verify the provider's signature, then **also re-confirm the transaction with the provider's API** before returning "succeeded"), register it in `get_provider()`, set `PAYMENT_MODE=live`, `PAYMENT_PROVIDER=<name>`, `PAYMENT_WEBHOOK_SECRET`, and point the provider's webhook at `https://YOUR-DOMAIN/api/webhooks/payments/<name>`. Then test with the provider's sandbox *before* real money.
* Card numbers / PINs never touch this system. Only references are stored.
* Refunds are manual (in the provider dashboard). Cancelling a paid order marks it **Refund due**.

## 4. Email (optional)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` in `backend/.env`. Order confirmations (after verified payment) and shipping updates are then sent. With no SMTP host, nothing is sent and the log says so.

---
## 5. Run the tests
```bash
cd backend && source .venv/bin/activate
PYTHONPATH=. pytest -q                 # 89 backend tests on a temporary REAL PostgreSQL (never your data)
cd ../frontend && npm test             # 23 frontend tests
npm run build                          # production build + type check
# live end-to-end (servers running, DEVELOPMENT database only):
cd ../backend && BASE_URL=http://127.0.0.1:5173 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' python scripts/e2e_live.py
```
The optional browser test is `frontend/e2e/purchase.spec.ts` (Playwright; instructions at the top of the file).

## 6. Project map
```
backend/app/main.py           app, CSRF/security middleware        backend/app/api/        endpoints (auth, catalog, shop, admin…)
backend/app/models/           all database tables                  backend/app/services/   cart, orders+stock locking, payments, storage, email
backend/alembic/versions/     migrations                           backend/tests/          automated tests
backend/app/cli.py            create-admin, release-expired        backend/app/seed.py     demo data (refuses in production)
frontend/src/pages/           customer pages                       frontend/src/pages/admin/  admin pages
frontend/src/components/      reusable UI                          frontend/src/lib/       API client, validation, formatting
```
Deployment, backups, HTTPS and troubleshooting: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Security design: [`docs/SECURITY.md`](docs/SECURITY.md).
