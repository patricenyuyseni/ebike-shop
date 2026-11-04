def test_only_published_products_are_public(admin, catalog, client):
    admin.post("/api/admin/products", json={"name": "Secret Draft", "sku": "DR-1", "price_minor": 100, "is_published": False})
    names = [p["name"] for p in client.get("/api/products").json()["items"]]
    assert "Trail Alpha" in names and "Secret Draft" not in names
    assert client.get("/api/products/secret-draft").status_code == 404


def test_detail_has_specs_images_and_hides_exact_stock(client, catalog):
    p = client.get("/api/products/trail-alpha").json()
    assert p["specs"]["motor_power_w"] == 750 and p["specs"]["colors"] == ["Black"]
    assert "stock_quantity" not in p and p["available_quantity"] == 5 and p["stock_status"] == "in_stock"
    assert p["related"][0]["slug"] == "city-beta"


def test_search_filter_sort_pagination(client, catalog):
    assert [p["slug"] for p in client.get("/api/products?q=city").json()["items"]] == ["city-beta"]
    assert client.get("/api/products?q=TA-1").json()["total"] == 1  # search by SKU
    assert client.get("/api/products?category=mountain").json()["total"] == 2
    assert client.get("/api/products?category=nope").json()["total"] == 0
    assert client.get("/api/products?max_price=600000").json()["total"] == 1
    assert client.get("/api/products?min_price=600000").json()["total"] == 1
    assert client.get("/api/products?min_range_km=100").json()["total"] == 0
    assert client.get("/api/products?frame_material=aluminium").json()["total"] == 2
    asc = [p["price_minor"] for p in client.get("/api/products?sort=price_asc").json()["items"]]
    assert asc == sorted(asc)
    page = client.get("/api/products?page_size=1&page=2").json()
    assert page["page"] == 2 and page["pages"] == 2 and len(page["items"]) == 1


def test_sql_injection_and_wildcards_are_harmless(client, catalog):
    for evil in ["'; DROP TABLE products; --", "' OR '1'='1", "%", "_"]:
        r = client.get("/api/products", params={"q": evil})
        assert r.status_code == 200 and r.json()["total"] == 0
    assert client.get("/api/products").json()["total"] == 2  # table still there
    assert client.get("/api/products?sort=price; drop table").status_code == 422
    assert client.get("/api/products?page_size=9999").status_code == 422


def test_out_of_stock_status_and_filter(admin, client, catalog):
    admin.post(f"/api/admin/inventory/{catalog['b']['id']}/adjust", json={"delta": -2, "reason": "sold offline"})
    items = {p["slug"]: p for p in client.get("/api/products").json()["items"]}
    assert items["city-beta"]["stock_status"] == "out_of_stock"
    assert [p["slug"] for p in client.get("/api/products?in_stock=true").json()["items"]] == ["trail-alpha"]


def test_hidden_category_hides_its_products(admin, client, catalog):
    cid = catalog["category"]["id"]
    admin.put(f"/api/admin/categories/{cid}", json={"name": "Mountain", "is_published": False})
    assert client.get("/api/products").json()["total"] == 0
    assert client.get("/api/categories").json() == []


def test_categories_list_with_counts(client, catalog):
    cats = client.get("/api/categories").json()
    assert cats[0]["slug"] == "mountain" and cats[0]["product_count"] == 2


def test_newsletter_signup_stored_and_duplicates_quiet(client, db):
    from sqlalchemy import select
    from app.models import NewsletterSubscriber
    assert client.post("/api/newsletter", json={"email": "Fan@Example.com"}).json()["ok"]
    assert client.post("/api/newsletter", json={"email": "fan@example.com"}).status_code == 200  # same answer for duplicates
    assert client.post("/api/newsletter", json={"email": "bad"}).status_code == 422
    assert db.scalars(select(NewsletterSubscriber.email)).all() == ["fan@example.com"]


def test_featured_reviews_empty_until_real_approved_reviews_exist(client):
    assert client.get("/api/reviews/featured").json() == []


def test_sitemap_lists_only_public_pages(admin, client, catalog):
    admin.post("/api/admin/products", json={"name": "Hidden Draft", "sku": "HD-1", "price_minor": 100})
    xml = client.get("/api/sitemap.xml").text
    assert "/product/trail-alpha" in xml and "hidden-draft" not in xml and "category=mountain" in xml


def test_public_config_has_no_secrets(client):
    r = client.get("/api/config")
    assert r.status_code == 200 and r.json()["payment_mode"] == "test" and r.json()["countries"] == ["CM"]
    for word in ("secret", "key", "password", "api_secret"):
        assert word not in r.text.lower().replace("payment_mode", "")
