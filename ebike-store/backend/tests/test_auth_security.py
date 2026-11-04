from sqlalchemy import select

from app.core.config import settings
from app.core.security import limiter
from app.models import AuditLog, User
from tests.conftest import create_user

REG = {"email": "new@example.com", "password": "Passw0rd-long1", "full_name": "New Person"}


def test_register_login_logout_me(make_client):
    c = make_client()
    r = c.post("/api/auth/register", json=REG)
    assert r.status_code == 201 and r.json()["role"] == "customer"
    assert "password" not in r.text and "hash" not in r.text
    assert c.get("/api/auth/me").json()["email"] == "new@example.com"
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").json() is None
    r = c.post("/api/auth/login", json={"email": "NEW@example.com", "password": REG["password"]})
    assert r.status_code == 200  # email is case-insensitive


def test_password_is_hashed_with_argon2(client, db):
    client.post("/api/auth/register", json=REG)
    h = db.scalar(select(User.password_hash).where(User.email == REG["email"]))
    assert h.startswith("$argon2") and REG["password"] not in h


def test_duplicate_and_weak_passwords_rejected(client):
    assert client.post("/api/auth/register", json=REG).status_code == 201
    assert client.post("/api/auth/register", json={**REG, "email": "NEW@example.com"}).status_code == 409
    assert client.post("/api/auth/register", json={**REG, "email": "x@example.com", "password": "short1"}).status_code == 422
    r = client.post("/api/auth/register", json={**REG, "email": "y@example.com", "password": "onlyletterslong"})
    assert r.status_code == 422 and "onlyletterslong" not in r.text  # never echoes the password back
    assert client.post("/api/auth/register", json={**REG, "email": "not-an-email"}).status_code == 422


def test_wrong_login_gives_generic_error(client):
    create_user("a@example.com")
    r1 = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-password1"})
    r2 = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password1"})
    assert r1.status_code == r2.status_code == 401 and r1.json() == r2.json()


def test_login_rate_limit(client):
    settings.rate_limit_enabled = True
    limiter.reset()
    codes = [client.post("/api/auth/login", json={"email": "a@example.com", "password": "bad-password-1"}).status_code for _ in range(12)]
    assert 429 in codes and codes[0] == 401


def test_csrf_required_for_state_changes(make_client):
    from app.main import app
    from fastapi.testclient import TestClient
    raw = TestClient(app)  # no csrf token at all
    assert raw.post("/api/auth/register", json=REG).status_code == 403
    c = make_client()
    c.headers["X-CSRF-Token"] = "wrong-token"
    assert c.post("/api/auth/register", json=REG).status_code == 403


def test_cross_origin_requests_blocked(client):
    r = client.post("/api/auth/register", json=REG, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_cors_only_allows_our_frontend(client):
    r = client.options("/api/products", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}
    r = client.options("/api/products", headers={"Origin": settings.frontend_origin, "Access-Control-Request-Method": "GET"})
    assert r.headers["access-control-allow-origin"] == settings.frontend_origin


def test_session_cookie_is_httponly(make_client):
    c = make_client()
    r = c.post("/api/auth/register", json=REG)
    cookie = [h for h in r.headers.get_list("set-cookie") if h.startswith("eb_session")][0]
    assert "HttpOnly" in cookie and "samesite=lax" in cookie.lower()


def test_security_headers_present(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"


ADMIN_ENDPOINTS = [("get", "/api/admin/dashboard"), ("get", "/api/admin/products"), ("get", "/api/admin/orders"), ("get", "/api/admin/inventory"),
                   ("get", "/api/admin/categories"), ("get", "/api/admin/audit-logs"), ("get", "/api/admin/orders/export.csv"),
                   ("post", "/api/admin/products"), ("post", "/api/admin/categories")]


def test_admin_endpoints_reject_anonymous_and_customers(client, customer):
    for method, url in ADMIN_ENDPOINTS:
        assert getattr(client, method)(url).status_code in (401, 403, 422) and getattr(client, method)(url).status_code != 200, url
        r = getattr(customer, method)(url, **({"json": {}} if method == "post" else {}))
        assert r.status_code == 403, (url, r.status_code)


def test_customer_cannot_log_into_admin(customer, make_client):
    c = make_client()
    r = c.post("/api/admin/auth/login", json={"email": "buyer@example.com", "password": "Passw0rd-long1"})
    assert r.status_code == 401
    assert c.get("/api/admin/dashboard").status_code == 401  # no session was created


def test_admin_login_writes_audit_log(admin, db):
    actions = {a for a in db.scalars(select(AuditLog.action))}
    assert "admin.login" in actions


def test_failed_admin_login_is_audited(make_client, db):
    c = make_client()
    c.post("/api/admin/auth/login", json={"email": "ghost@example.com", "password": "whatever-123"})
    assert "admin.login_denied" in set(db.scalars(select(AuditLog.action)))


def test_tampered_session_cookie_rejected(client):
    client.cookies.set("eb_session", "not.a.jwt")
    assert client.get("/api/auth/me").json() is None


def test_production_config_rejects_unsafe_defaults():
    import pytest
    from app.core.config import Settings
    with pytest.raises(RuntimeError):
        Settings(app_env="production", secret_key="short", cookie_secure=False, database_url="x").validate_for_production()
    Settings(app_env="production", secret_key="x" * 40, cookie_secure=True, database_url="x").validate_for_production()


def test_unexpected_errors_do_not_leak_details(catalog, monkeypatch):
    from app.api import catalog as catalog_api
    from app.main import app
    from fastapi.testclient import TestClient

    def boom(*a, **k):
        raise RuntimeError("secret database password=hunter2 host=10.0.0.5")
    monkeypatch.setattr(catalog_api, "product_card", boom)
    r = TestClient(app, raise_server_exceptions=False).get("/api/products")
    assert r.status_code == 500 and "hunter2" not in r.text and "10.0.0.5" not in r.text and "RuntimeError" not in r.text
    assert r.json() == {"detail": "Something went wrong on our side. Please try again."}


def test_other_rate_limits_apply(client, catalog):
    settings.rate_limit_enabled = True
    limiter.reset()
    codes = [client.post("/api/newsletter", json={"email": f"x{i}@example.com"}).status_code for i in range(8)]
    assert codes[0] == 200 and 429 in codes
    codes = [client.post("/api/auth/register", json={**REG, "email": f"r{i}@example.com"}).status_code for i in range(12)]
    assert 429 in codes


def test_hosting_style_database_urls_are_normalised():
    from app.core.config import Settings
    assert Settings(database_url="postgres://u:p@h:5432/d").database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert Settings(database_url="postgresql://u:p@h/d").database_url == "postgresql+psycopg://u:p@h/d"
    assert Settings(database_url="postgresql+psycopg://u:p@h/d").database_url == "postgresql+psycopg://u:p@h/d"
