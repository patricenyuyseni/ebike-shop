from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import catalog as catalog_api
from app.spa import mount_frontend

INDEX = """<!doctype html><html><head><title>VoltRide | Electric Bicycles</title>
<meta name="description" content="generic" /></head><body><div id="root"></div></body></html>"""


@pytest.fixture
def site(tmp_path: Path, catalog):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "index.html").write_text(INDEX)
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("TOP SECRET")
    app = FastAPI()
    app.include_router(catalog_api.router)
    mount_frontend(app, tmp_path)
    return TestClient(app)


def test_spa_fallback_security_headers_and_caching(site):
    r = site.get("/some/react/route")
    assert r.status_code == 200 and '<div id="root">' in r.text
    assert "default-src 'self'" in r.headers["content-security-policy"] and r.headers["cache-control"] == "no-cache"
    a = site.get("/assets/app-abc123.js")
    assert a.status_code == 200 and "immutable" in a.headers["cache-control"]
    assert site.get("/favicon.svg").status_code == 200


def test_api_paths_are_never_swallowed_by_the_website(site):
    assert site.get("/api/does-not-exist").status_code == 404
    assert site.get("/api/does-not-exist").json() == {"detail": "Not found."}
    assert site.get("/api/products").status_code == 200  # real routes still win


def test_path_traversal_cannot_read_files_outside_dist(site):
    for evil in ["/../secret.txt", "/..%2Fsecret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]:
        r = site.get(evil)
        assert "TOP SECRET" not in r.text, evil


def test_product_pages_get_real_seo_tags_in_raw_html(site):
    r = site.get("/product/trail-alpha")
    assert "<title>Trail Alpha | Electric Bicycle</title>" in r.text
    assert 'property="og:title"' in r.text and 'rel="canonical"' in r.text and 'content="generic"' not in r.text
    assert "<title>VoltRide | Electric Bicycles</title>" in site.get("/product/unknown-bike").text  # unknown: generic page


def test_product_meta_is_html_escaped(admin, site):
    admin.post("/api/admin/products", json={"name": 'Bad <script>alert(1)</script> "Bike"', "sku": "XSS-1", "price_minor": 1000, "is_published": True,
                                           "description": '"><img src=x onerror=alert(1)>'})
    slug = admin.get("/api/admin/products?q=XSS-1").json()["items"][0]["slug"]
    body = site.get(f"/product/{slug}").text
    assert "<script>alert(1)" not in body and "<img src=x" not in body and "&lt;script&gt;" in body


def test_robots_and_sitemap_at_site_root(site):
    assert "Sitemap: http" in site.get("/robots.txt").text and "Disallow: /admin" in site.get("/robots.txt").text
    assert "<urlset" in site.get("/sitemap.xml").text


def test_head_requests_work_for_crawlers_and_monitors(site):
    for path in ["/", "/shop", "/product/trail-alpha", "/robots.txt", "/sitemap.xml"]:
        assert site.head(path).status_code == 200, path
