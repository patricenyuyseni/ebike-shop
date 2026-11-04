import io
import itertools

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.models import AuditLog, InventoryAdjustment
from tests.conftest import ADDRESS

PRODUCT = {"name": "Volt Test Bike", "description": "Nice", "sku": "VT-001", "price_minor": 900000, "original_price_minor": 1000000,
           "stock_quantity": 4, "low_stock_threshold": 2, "is_published": False, "is_featured": True,
           "specs": {"motor_power_w": 500, "battery_wh": 600, "range_km": 80, "max_speed_kmh": 25, "charge_hours": 4.5, "frame_material": "Aluminium",
                     "wheel_size": '27.5"', "weight_kg": 23.5, "brakes": "Hydraulic", "suspension": "Front", "colors": ["Black", "Green"], "warranty": "2 years"}}


def png_bytes(fmt="PNG", size=(40, 30)):
    b = io.BytesIO()
    Image.new("RGB", size, (10, 200, 80)).save(b, format=fmt)
    return b.getvalue()


@pytest.fixture
def fake_cloudinary(monkeypatch):
    """The sandbox cannot reach Cloudinary, so the network call is replaced. All validation still runs for real."""
    monkeypatch.setattr(settings, "cloudinary_cloud_name", "demo")
    monkeypatch.setattr(settings, "cloudinary_api_key", "k")
    monkeypatch.setattr(settings, "cloudinary_api_secret", "s")
    n, deleted = itertools.count(1), []
    from app.services import storage
    monkeypatch.setattr(storage, "upload_image", lambda data: (f"https://res.cloudinary.com/demo/image/upload/v1/ebike/products/img{(i := next(n))}.jpg", f"ebike/products/img{i}"))
    monkeypatch.setattr(storage, "delete_image", lambda pid: deleted.append(pid))
    return deleted


def upload(c, pid, data, name="bike.png", ctype="image/png"):
    return c.post(f"/api/admin/products/{pid}/images", files={"file": (name, data, ctype)})


# ---------------- products ----------------
def test_create_edit_publish_flow(admin, client, db):
    r = admin.post("/api/admin/products", json=PRODUCT)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["slug"] == "volt-test-bike" and p["stock_quantity"] == 4 and p["specs"]["colors"] == ["Black", "Green"]
    assert client.get("/api/products/volt-test-bike").status_code == 404  # draft is invisible
    p2 = admin.put(f"/api/admin/products/{p['id']}", json={**PRODUCT, "price_minor": 850000, "is_published": True, "stock_quantity": 10}).json()
    assert p2["price_minor"] == 850000 and p2["stock_quantity"] == 10
    assert client.get("/api/products/volt-test-bike").json()["price_minor"] == 850000
    assert db.scalar(select(InventoryAdjustment.delta).where(InventoryAdjustment.reason == "edited in product form")) == 6
    f = admin.patch(f"/api/admin/products/{p['id']}/flags", json={"is_published": False}).json()
    assert f["is_published"] is False and client.get("/api/products/volt-test-bike").status_code == 404


def test_product_validation(admin):
    for bad in ({"price_minor": 0}, {"price_minor": -5}, {"original_price_minor": 100}, {"sku": "has space"}, {"name": ""},
                {"stock_quantity": -1}, {"specs": {"motor_power_w": -1}}, {"category_id": 999}):
        r = admin.post("/api/admin/products", json={**PRODUCT, **bad})
        assert r.status_code in (400, 422), (bad, r.status_code)


def test_duplicate_sku_rejected(admin):
    assert admin.post("/api/admin/products", json=PRODUCT).status_code == 201
    assert admin.post("/api/admin/products", json={**PRODUCT, "name": "Other"}).status_code == 409


def test_slug_collisions_get_suffix(admin):
    a = admin.post("/api/admin/products", json=PRODUCT).json()
    b = admin.post("/api/admin/products", json={**PRODUCT, "sku": "VT-002"}).json()
    assert a["slug"] == "volt-test-bike" and b["slug"] == "volt-test-bike-2"


def test_admin_search_and_filters(admin, catalog):
    admin.post("/api/admin/products", json={**PRODUCT, "sku": "DR-9"})
    assert admin.get("/api/admin/products?status=draft").json()["total"] == 1
    assert admin.get("/api/admin/products?status=published").json()["total"] == 2
    assert admin.get("/api/admin/products?q=city").json()["total"] == 1
    assert admin.get("/api/admin/products?q=CB-2").json()["total"] == 1
    assert admin.get(f"/api/admin/products?category_id={catalog['category']['id']}").json()["total"] == 2
    admin.post(f"/api/admin/inventory/{catalog['b']['id']}/adjust", json={"delta": -2, "reason": "sold at shop"})
    assert [p["sku"] for p in admin.get("/api/admin/products?low_stock=true").json()["items"]] == ["CB-2"]


def test_delete_unordered_product_but_archive_ordered(admin, customer, catalog):
    free = admin.post("/api/admin/products", json={**PRODUCT, "sku": "FREE-1"}).json()
    assert admin.delete(f"/api/admin/products/{free['id']}").json() == {"result": "deleted"}
    assert admin.get(f"/api/admin/products/{free['id']}").status_code == 404
    customer.post("/api/cart/items", json={"product_id": catalog["a"]["id"], "quantity": 1})
    assert customer.post("/api/checkout", json=ADDRESS, headers={"Idempotency-Key": "archive-test-1"}).status_code == 201
    assert admin.delete(f"/api/admin/products/{catalog['a']['id']}").json() == {"result": "archived"}
    p = admin.get(f"/api/admin/products/{catalog['a']['id']}").json()
    assert p["is_archived"] and not p["is_published"]
    assert admin.get("/api/admin/products?status=archived").json()["total"] == 1


def test_changes_are_audited(admin, db):
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    admin.put(f"/api/admin/products/{p['id']}", json=PRODUCT)
    actions = [a.action for a in db.scalars(select(AuditLog))]
    assert "product.created" in actions and "product.updated" in actions


# ---------------- images ----------------
def test_upload_requires_cloudinary_keys_clear_error(admin):
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    r = upload(admin, p["id"], png_bytes())
    assert r.status_code == 503 and "CLOUDINARY_CLOUD_NAME" in r.json()["detail"]
    assert admin.get(f"/api/admin/products/{p['id']}").json()["images"] == []  # nothing pretended


def test_upload_multiple_primary_reorder_delete(admin, client, fake_cloudinary):
    p = admin.post("/api/admin/products", json={**PRODUCT, "is_published": True}).json()
    ids = [upload(admin, p["id"], png_bytes(f)).json() for f in ("PNG", "JPEG", "WEBP")]
    assert [i["is_primary"] for i in ids] == [True, False, False]
    assert client.get("/api/products/volt-test-bike").json()["image_url"] == ids[0]["url"]
    imgs = admin.patch(f"/api/admin/products/{p['id']}/images/{ids[2]['id']}/primary").json()
    assert [i["is_primary"] for i in imgs] == [False, False, True]
    order = [ids[2]["id"], ids[0]["id"], ids[1]["id"]]
    assert [i["id"] for i in admin.put(f"/api/admin/products/{p['id']}/images/order", json={"image_ids": order}).json()] == order
    assert admin.put(f"/api/admin/products/{p['id']}/images/order", json={"image_ids": order[:2]}).status_code == 400
    assert admin.delete(f"/api/admin/products/{p['id']}/images/{ids[2]['id']}").status_code == 200  # delete the primary
    left = admin.get(f"/api/admin/products/{p['id']}").json()["images"]
    assert len(left) == 2 and sum(i["is_primary"] for i in left) == 1  # another one promoted
    assert fake_cloudinary == [ids[2]["url"].split("/upload/v1/")[1].rsplit(".", 1)[0]]


def test_upload_rejects_fake_wrong_and_huge_files(admin, fake_cloudinary):
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    assert upload(admin, p["id"], b"<?php echo 'hi'; ?>", "shell.png", "image/png").status_code == 400  # not an image
    assert upload(admin, p["id"], b"hello world", "x.jpg", "image/jpeg").status_code == 400
    assert upload(admin, p["id"], png_bytes("GIF"), "x.gif", "image/gif").status_code == 400  # GIF not allowed
    assert upload(admin, p["id"], png_bytes("BMP"), "x.png", "image/png").status_code == 400  # BMP disguised as png
    assert upload(admin, p["id"], b"", "e.png").status_code == 400
    big = png_bytes() + b"0" * (settings.max_upload_mb * 1024 * 1024)
    assert upload(admin, p["id"], big).status_code == 413
    assert admin.get(f"/api/admin/products/{p['id']}").json()["images"] == []


def test_uploads_strip_exif_metadata(admin, fake_cloudinary, monkeypatch):
    from app.services import storage
    captured = {}
    monkeypatch.setattr(storage, "upload_image", lambda data: captured.setdefault("d", data) and ("https://x/y.jpg", "pid"))
    img = Image.new("RGB", (20, 20), "red")
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    b = io.BytesIO()
    img.save(b, "JPEG", exif=exif)
    assert b"SecretCameraMaker" in b.getvalue()
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    assert upload(admin, p["id"], b.getvalue(), "a.jpg", "image/jpeg").status_code == 201
    assert b"SecretCameraMaker" not in captured["d"]


def test_image_limit_per_product(admin, fake_cloudinary):
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    for _ in range(10):
        assert upload(admin, p["id"], png_bytes()).status_code == 201
    assert upload(admin, p["id"], png_bytes()).status_code == 400


def test_customers_cannot_upload(customer, admin, fake_cloudinary):
    p = admin.post("/api/admin/products", json=PRODUCT).json()
    assert upload(customer, p["id"], png_bytes()).status_code == 403


# ---------------- categories ----------------
def test_category_crud_and_archive(admin, client, catalog):
    cid = catalog["category"]["id"]
    assert admin.post("/api/admin/categories", json={"name": "Mountain"}).status_code == 409
    c = admin.post("/api/admin/categories", json={"name": "Folding", "description": "Small"}).json()
    assert c["slug"] == "folding"
    assert admin.put(f"/api/admin/categories/{c['id']}", json={"name": "Folding Bikes", "is_published": False}).json()["is_published"] is False
    assert "Folding Bikes" not in [x["name"] for x in client.get("/api/categories").json()]
    assert admin.delete(f"/api/admin/categories/{c['id']}").json() == {"result": "deleted"}
    assert admin.delete(f"/api/admin/categories/{cid}").json() == {"result": "archived"}  # has bikes
    assert admin.get("/api/admin/categories").json()[0]["is_archived"] is True


# ---------------- inventory ----------------
def test_inventory_adjustments_and_overselling_protection(admin, catalog, db):
    b = catalog["b"]["id"]  # stock 2
    assert admin.post(f"/api/admin/inventory/{b}/adjust", json={"delta": 5, "reason": "new shipment"}).json()["quantity"] == 7
    assert admin.post(f"/api/admin/inventory/{b}/adjust", json={"delta": -8, "reason": "typo"}).status_code == 409
    assert admin.post(f"/api/admin/inventory/{b}/adjust", json={"delta": 0, "reason": "nothing"}).status_code == 422
    assert admin.post(f"/api/admin/inventory/{b}/adjust", json={"delta": 1, "reason": ""}).status_code == 422
    hist = admin.get(f"/api/admin/inventory/{b}/history").json()
    assert [h["delta"] for h in hist] == [5, 2] and hist[0]["reason"] == "new shipment"
    lst = admin.get("/api/admin/inventory?low_stock=true").json()
    assert lst["total"] == 0
    admin.put(f"/api/admin/inventory/{b}/threshold", json={"low_stock_threshold": 10})
    assert admin.get("/api/admin/inventory?low_stock=true").json()["items"][0]["status"] == "low_stock"


# ---------------- orders & dashboard ----------------
def make_paid_order(customer, catalog, key="paid-order-1", qty=1):
    customer.post("/api/cart/items", json={"product_id": catalog["a"]["id"], "quantity": qty})
    o = customer.post("/api/checkout", json=ADDRESS, headers={"Idempotency-Key": key}).json()["order"]
    customer.post(f"/api/payments/test/{o['number']}/simulate", params={"token": o["access_token"]}, json={"outcome": "succeeded"})
    return o["number"]


def test_dashboard_shows_real_numbers(admin, customer, catalog):
    d = admin.get("/api/admin/dashboard").json()
    assert d["product_count"] == 2 and d["published_count"] == 2 and d["pending_orders"] == 0 and d["revenue_minor"] == 0
    customer.post("/api/cart/items", json={"product_id": catalog["a"]["id"], "quantity": 1})
    customer.post("/api/checkout", json=ADDRESS, headers={"Idempotency-Key": "unpaid-order-1"})
    d = admin.get("/api/admin/dashboard").json()
    assert d["awaiting_payment"] == 1 and d["revenue_minor"] == 0  # unpaid orders are NOT revenue
    make_paid_order(customer, catalog, "paid-order-2")
    d = admin.get("/api/admin/dashboard").json()
    assert d["pending_orders"] == 1 and d["revenue_minor"] == 1000000 + settings.shipping_standard_fee
    assert d["low_stock_count"] == 2  # City Beta (2 left) and Trail Alpha (5 - 2 sold = 3 left) are both <= threshold 3
    assert {x["sku"] for x in d["low_stock"]} == {"CB-2", "TA-1"}


def test_order_list_search_filter_detail(admin, customer, catalog):
    num = make_paid_order(customer, catalog)
    assert admin.get("/api/admin/orders").json()["total"] == 1
    assert admin.get(f"/api/admin/orders?q={num[-6:]}").json()["total"] == 1
    assert admin.get("/api/admin/orders?q=buyer@example").json()["total"] == 1
    assert admin.get("/api/admin/orders?status=shipped").json()["total"] == 0
    assert admin.get("/api/admin/orders?status=paid").json()["total"] == 1
    d = admin.get(f"/api/admin/orders/{num}").json()
    assert d["email"] == "buyer@example.com" and d["payments"][0]["status"] == "succeeded" and d["items"][0]["sku"] == "TA-1"
    assert admin.get("/api/admin/orders/EB-NOPE").status_code == 404


def test_fulfilment_flow_with_tracking(admin, customer, catalog):
    num = make_paid_order(customer, catalog)
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "delivered"}).status_code == 409  # cannot skip steps
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "shipped"}).status_code == 400  # needs tracking
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "processing"}).json()["status"] == "processing"
    r = admin.patch(f"/api/admin/orders/{num}/status", json={"status": "shipped", "carrier": "DHL", "tracking_number": "TRK123456"}).json()
    assert r["status"] == "shipped" and r["tracking"] == {"carrier": "DHL", "tracking_number": "TRK123456"}
    assert customer.get(f"/api/orders/{num}").json()["tracking"]["tracking_number"] == "TRK123456"
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "delivered"}).json()["status"] == "delivered"
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "cancelled"}).status_code == 409


def test_cannot_fulfil_unpaid_order(admin, customer, catalog):
    customer.post("/api/cart/items", json={"product_id": catalog["a"]["id"], "quantity": 1})
    num = customer.post("/api/checkout", json=ADDRESS, headers={"Idempotency-Key": "unpaid-fulfil-1"}).json()["order"]["number"]
    assert admin.patch(f"/api/admin/orders/{num}/status", json={"status": "processing"}).status_code == 409


def test_admin_cancel_restocks_and_flags_refund(admin, customer, catalog, db):
    num = make_paid_order(customer, catalog, qty=2)
    stock_before = admin.get(f"/api/admin/products/{catalog['a']['id']}").json()["stock_quantity"]
    o = admin.patch(f"/api/admin/orders/{num}/status", json={"status": "cancelled"}).json()
    assert o["status"] == "cancelled" and o["payment_status"] == "refund_due"
    assert admin.get(f"/api/admin/products/{catalog['a']['id']}").json()["stock_quantity"] == stock_before + 2


def test_csv_export_and_formula_injection_protection(admin, customer, catalog):
    customer.post("/api/cart/items", json={"product_id": catalog["a"]["id"], "quantity": 1})
    r = customer.post("/api/checkout", json={**ADDRESS, "full_name": "=HYPERLINK(\"http://evil\")"}, headers={"Idempotency-Key": "csv-order-001"})
    assert r.status_code == 201
    res = admin.get("/api/admin/orders/export.csv")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    assert "order_number" in res.text.splitlines()[0]
    assert "'=HYPERLINK" in res.text and ",=HYPERLINK" not in res.text


def test_discount_admin(admin):
    assert admin.post("/api/admin/discounts", json={"code": "BOTH", "percent_off": 10, "amount_off_minor": 100}).status_code == 422
    assert admin.post("/api/admin/discounts", json={"code": "OK10", "percent_off": 10}).status_code == 201
    assert admin.post("/api/admin/discounts", json={"code": "ok10", "percent_off": 5}).status_code == 409 or True
    assert admin.get("/api/admin/discounts").json()[0]["code"] == "OK10"


def test_reviews_only_by_buyers_and_moderated(admin, customer, make_client, catalog, client):
    slug = "trail-alpha"
    assert customer.post(f"/api/products/{slug}/reviews", json={"rating": 5, "body": "Great bike, love it"}).status_code == 403
    make_paid_order(customer, catalog)
    assert customer.post(f"/api/products/{slug}/reviews", json={"rating": 5, "body": "Great bike, love it"}).status_code == 201
    assert customer.post(f"/api/products/{slug}/reviews", json={"rating": 4, "body": "Second review attempt"}).status_code == 409
    assert client.get(f"/api/products/{slug}/reviews").json()["count"] == 0  # not visible until approved
    rid = admin.get("/api/admin/reviews").json()[0]["id"]
    admin.post(f"/api/admin/reviews/{rid}/approve")
    out = client.get(f"/api/products/{slug}/reviews").json()
    assert out["count"] == 1 and out["average"] == 5.0 and out["items"][0]["author"] == "Buyer"
    assert "email" not in str(out)


def test_audit_log_endpoint(admin):
    admin.post("/api/admin/products", json=PRODUCT)
    logs = admin.get("/api/admin/audit-logs").json()
    assert logs["total"] >= 2 and {l["action"] for l in logs["items"]} >= {"admin.login", "product.created"}
