# E-Bike Store: Architecture (Phase 1)

## How the pieces fit together
Browser (React app) --HTTP/JSON--> FastAPI backend --SQL--> PostgreSQL
                                        |--> Cloudinary (images, Phase 5)
                                        |--> Payment provider (Phase 6)

- **Frontend** (`frontend/`): what customers see. Never holds secrets. Asks the backend for data.
- **Backend** (`backend/`): the only part that talks to the database, Cloudinary and payments. It checks prices, stock and permissions.
- **Database**: PostgreSQL stores users, products, orders. Alembic migrations create/change tables safely.

## Directory structure
ebike-store/
  backend/
    app/main.py        <- FastAPI entry point
    app/core/          <- settings, security helpers
    app/models/        <- SQLAlchemy tables
    app/schemas/       <- Pydantic request/response shapes
    app/api/           <- URL endpoints (routers)
    app/services/      <- business logic (checkout, stock, payments)
    tests/             <- automated tests
    requirements.txt, .env.example
  frontend/
    src/               <- React + TypeScript code
    .env.example
  docs/

## Phase plan
1. Architecture + scaffold  (done, tested below)
2. Frontend design and pages (mock data, clearly labeled)
3. Backend + PostgreSQL + API, connect frontend
4. Admin dashboard + Cloudinary uploads
5. Cart, checkout, payments, emails
6. Security review, tests, SEO, deployment

## Rules we follow
- Secrets live only in `.env` files, never in Git or the frontend.
- Prices and stock are always calculated on the server.
- Payments are marked "paid" only after server-side provider verification.
