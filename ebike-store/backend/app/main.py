import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core import db as dbmod
from app.core.config import settings
from app.core.deps import CSRF_COOKIE
from app.core.security import constant_time_equal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ebike")

if settings.is_production:
    settings.validate_for_production()
if settings.database_url:
    dbmod.init_engine(settings.database_url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if dbmod.get_engine() is not None:
        try:
            from app.services.common import ensure_roles
            with dbmod.SessionLocal() as s:
                ensure_roles(s)
        except Exception:
            log.exception("Could not prepare roles. Have you run 'alembic upgrade head'?")
    yield


app = FastAPI(title="E-Bike Store API", version="1.0.0", lifespan=lifespan,
              docs_url=None if settings.is_production else "/docs", redoc_url=None, openapi_url=None if settings.is_production else "/openapi.json")

app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"])

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def security_layer(request: Request, call_next):
    # CSRF: double-submit token + Origin check on every state-changing request (webhooks are server-to-server and signed instead).
    if request.method in UNSAFE and not request.url.path.startswith("/api/webhooks/"):
        origin = request.headers.get("origin")
        if origin and origin != settings.frontend_origin:
            return JSONResponse({"detail": "Request blocked (origin not allowed)."}, status_code=403)
        header, cookie = request.headers.get("x-csrf-token"), request.cookies.get(CSRF_COOKIE)
        if not header or not cookie or not constant_time_equal(header, cookie):
            return JSONResponse({"detail": "Security check failed. Please refresh the page and try again."}, status_code=403)
    try:
        response = await call_next(request)
    except Exception:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)
    response.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
                             "Permissions-Policy": "camera=(), microphone=(), geolocation=()"})
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/") and request.method == "GET":
        response.headers.setdefault("Cache-Control", "no-store" if request.url.path.split("/")[2] in ("auth", "cart", "orders", "admin", "account") else "public, max-age=30")
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # Friendly, safe messages (never echo the submitted values back, e.g. passwords).
    errors = [{"field": ".".join(str(x) for x in e["loc"][1:]) or "body", "message": e["msg"].replace("Value error, ", "")} for e in exc.errors()]
    return JSONResponse({"detail": "Please check the highlighted fields.", "errors": errors}, status_code=422)


from app.api import account, admin, auth, catalog, shop  # noqa: E402

for r in (auth.router, account.router, catalog.router, shop.router, admin.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/ready")
def ready():
    try:
        with dbmod.get_engine().connect() as c:
            c.execute(text("select 1"))
        return {"status": "ready"}
    except Exception:
        return JSONResponse({"status": "database unavailable"}, status_code=503)


# Production: serve the built website from this same server (set FRONTEND_DIST). Must stay LAST so /api routes win.
if settings.frontend_dist:
    from pathlib import Path
    from app.spa import mount_frontend
    _dist = Path(settings.frontend_dist)
    if (_dist / "index.html").is_file():
        mount_frontend(app, _dist)
    else:
        log.warning("FRONTEND_DIST is set but %s/index.html was not found: the website will not be served.", _dist)
