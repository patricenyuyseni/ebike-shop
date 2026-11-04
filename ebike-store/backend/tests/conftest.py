"""Tests run against a REAL temporary PostgreSQL (via the 'pgserver' package), never your real database.
The schema is created by running the Alembic migrations, so migrations are tested too."""
import os
import subprocess
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")
os.environ.update({"APP_ENV": "development", "RATE_LIMIT_ENABLED": "false", "PAYMENT_MODE": "test", "PAYMENT_PROVIDER": "test",
                   "DATABASE_URL": "", "CLOUDINARY_CLOUD_NAME": "", "CLOUDINARY_API_KEY": "", "CLOUDINARY_API_SECRET": "",
                   "SMTP_HOST": "", "TAX_RATE_PERCENT": "0"})

import pgserver  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import db as dbmod  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import hash_password, limiter  # noqa: E402


@pytest.fixture(scope="session")
def pg_url():
    d = tempfile.mkdtemp(prefix="ebike_test_pg_")
    server = pgserver.get_server(d)
    server.psql("create database ebike_test;")
    url = server.get_uri().replace("postgresql://", "postgresql+psycopg://").replace("/postgres?", "/ebike_test?")
    env = dict(os.environ, ALEMBIC_DATABASE_URL=url)
    r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], env=env, capture_output=True, text=True,
                       cwd=os.path.dirname(os.path.dirname(__file__)))
    assert r.returncode == 0, r.stderr
    yield url
    server.cleanup()


@pytest.fixture(scope="session")
def engine(pg_url):
    return dbmod.init_engine(pg_url)


@pytest.fixture(autouse=True)
def clean_db(engine):
    from app.models import Base
    from app.services.common import ensure_roles
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with dbmod.SessionLocal() as s:
        ensure_roles(s)
    limiter.reset()
    settings.rate_limit_enabled = False
    yield


@pytest.fixture
def db():
    with dbmod.SessionLocal() as s:
        yield s


def _client():
    from app.main import app
    c = TestClient(app)
    token = c.get("/api/auth/csrf").json()["csrf_token"]
    c.headers["X-CSRF-Token"] = token
    return c


@pytest.fixture
def client():
    return _client()


@pytest.fixture
def make_client():
    return _client


def create_user(email, password="Passw0rd-long1", role="customer", name="Test User"):
    from sqlalchemy import select
    from app.models import CustomerProfile, Role, User
    with dbmod.SessionLocal() as s:
        r = s.scalar(select(Role).where(Role.name == role))
        u = User(email=email, password_hash=hash_password(password), role_id=r.id)
        u.profile = CustomerProfile(full_name=name)
        s.add(u)
        s.commit()
        return u.id


@pytest.fixture
def admin(make_client):
    create_user("admin@example.com", "Admin-pass-12345", "admin", "Admin")
    c = make_client()
    r = c.post("/api/admin/auth/login", json={"email": "admin@example.com", "password": "Admin-pass-12345"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture
def customer(make_client):
    c = make_client()
    r = c.post("/api/auth/register", json={"email": "buyer@example.com", "password": "Passw0rd-long1", "full_name": "Buyer One", "phone": "+237 600 000 000"})
    assert r.status_code == 201, r.text
    return c


@pytest.fixture
def catalog(admin):
    """A category + 2 published bikes created through the real admin API."""
    cat = admin.post("/api/admin/categories", json={"name": "Mountain"}).json()
    def mk(name, sku, price, stock, **kw):
        body = {"name": name, "sku": sku, "price_minor": price, "stock_quantity": stock, "category_id": cat["id"], "is_published": True,
                "specs": {"motor_power_w": 750, "range_km": 80, "frame_material": "Aluminium", "colors": ["Black"]}, **kw}
        r = admin.post("/api/admin/products", json=body)
        assert r.status_code == 201, r.text
        return r.json()
    return {"category": cat, "a": mk("Trail Alpha", "TA-1", 1000000, 5), "b": mk("City Beta", "CB-2", 500000, 2, original_price_minor=600000)}


ADDRESS = {"email": "buyer@example.com", "full_name": "Buyer One", "phone": "+237 600 000 000", "line1": "12 Rue de la Paix",
           "city": "Yaoundé", "region": "Centre", "country": "CM", "shipping_method": "standard"}
