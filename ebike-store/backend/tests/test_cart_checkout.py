import json
import threading
import time

from sqlalchemy import select

from app.core.config import settings
from app.models import Inventory, InventoryAdjustment, Order, Payment
from app.services.payments import sign
from tests.conftest import ADDRESS, create_user


def add(c, pid, qty=1):
    return c.post("/api/cart/items", json={"product_id": pid, "quantity": qty})


def checkout(c, key="key-12345678", **over):
    return c.post("/api/checkout", json={**ADDRESS, **over}, headers={"Idempotency-Key": key})


def stock(db, pid):
    db.expire_all()
    return db.scalar(select(Inventory.quantity).where(Inventory.product_id == pid))


def signed_event(ref, status, amount, currency="XAF", event_id=None):
    body = json.dumps({"event_id": event_id or f"e-{ref}-{status}", "provider_ref": ref, "status": status, "amount_minor": amount, "currency": currency}).encode()
    ts = str(int(time.time()))
    return body, {"X-Timestamp": ts, "X-Signature": sign(body, ts), "Content-Type": "application/json"}


# ---------------- cart ----------------
def test_guest_cart_add_change_remove_and_totals(client, catalog):
    a, b = catalog["a"], catalog["b"]
    add(client, a["id"], 2)
    cart = add(client, b["id"], 1).json()
    assert cart["subtotal_minor"] == 2 * 1000000 + 500000 and cart["item_count"] == 3
    assert cart["items"][0]["name"] == "Trail Alpha" and cart["items"][0]["line_total_minor"] == 2000000
    cart = client.patch(f"/api/cart/items/{a['id']}", json={"quantity": 1}).json()
    assert cart["subtotal_minor"] == 1500000
    cart = client.delete(f"/api/cart/items/{b['id']}").json()
    assert cart["item_count"] == 1
    assert client.get("/api/cart").json()["subtotal_minor"] == 1000000  # persisted via guest cookie


def test_cart_cannot_exceed_stock_or_limit(client, catalog):
    b = catalog["b"]  # stock 2
    assert add(client, b["id"], 2).status_code == 200
    r = add(client, b["id"], 1)
    assert r.status_code == 409 and "Only 2" in r.json()["detail"]
    assert client.patch(f"/api/cart/items/{b['id']}", json={"quantity": 3}).status_code == 409
    assert client.post("/api/cart/items", json={"product_id": b["id"], "quantity": 99}).status_code == 422
    assert client.patch("/api/cart/items/12345", json={"quantity": 1}).status_code == 404


def test_cannot_add_unpublished_product(admin, client):
    p = admin.post("/api/admin/products", json={"name": "Draft", "sku": "DD-1", "price_minor": 100, "stock_quantity": 5}).json()
    assert add(client, p["id"]).status_code == 404


def test_guest_cart_merges_into_account_on_login(make_client, catalog):
    guest = make_client()
    add(guest, catalog["a"]["id"], 2)
    create_user("merge@example.com")
    guest.post("/api/auth/login", json={"email": "merge@example.com", "password": "Passw0rd-long1"})
    assert guest.get("/api/cart").json()["item_count"] == 2
    other_device = make_client()
    other_device.post("/api/auth/login", json={"email": "merge@example.com", "password": "Passw0rd-long1"})
    assert other_device.get("/api/cart").json()["item_count"] == 2  # account cart persists across devices


def test_carts_are_private(make_client, catalog):
    a, b = make_client(), make_client()
    add(a, catalog["a"]["id"], 1)
    assert b.get("/api/cart").json()["items"] == []


# ---------------- quote & validation ----------------
def test_quote_computed_on_server_with_shipping_and_discount(admin, client, catalog):
    admin.post("/api/admin/discounts", json={"code": "SAVE10", "percent_off": 10})
    add(client, catalog["a"]["id"], 1)
    q = client.post("/api/checkout/quote", json={"shipping_method": "express", "discount_code": "save10"}).json()
    assert q["subtotal_minor"] == 1000000 and q["discount_minor"] == 100000
    assert q["shipping_minor"] == settings.shipping_express_fee and q["total_minor"] == 900000 + settings.shipping_express_fee
    assert client.post("/api/checkout/quote", json={"shipping_method": "standard", "discount_code": "BOGUS"}).status_code == 400


def test_tax_is_applied_when_configured(client, catalog, monkeypatch):
    monkeypatch.setattr(settings, "tax_rate_percent", 19.25)
    add(client, catalog["b"]["id"], 1)
    q = client.post("/api/checkout/quote", json={"shipping_method": "pickup"}).json()
    assert q["tax_minor"] == round(500000 * 0.1925) and q["total_minor"] == 500000 + q["tax_minor"]


def test_checkout_validation_errors(client, catalog):
    add(client, catalog["a"]["id"])
    for bad in ({"email": "nope"}, {"phone": "abc"}, {"line1": ""}, {"country": "ZZZ"}, {"shipping_method": "teleport"}):
        assert checkout(client, **bad).status_code == 422, bad
    assert checkout(client, country="FR").status_code == 400  # we do not ship there
    assert client.post("/api/checkout", json=ADDRESS).status_code == 422  # missing Idempotency-Key
    assert checkout(client, key="short").status_code == 422


def test_empty_cart_cannot_checkout(client):
    assert checkout(client).status_code == 400


# ---------------- order creation ----------------
def test_order_created_with_server_prices_and_stock_reserved(client, catalog, db):
    a = catalog["a"]
    add(client, a["id"], 2)
    # a malicious browser tries to set its own prices - these fields do not exist and are ignored
    r = checkout(client, price_minor=1, total_minor=1, items=[{"product_id": a["id"], "unit_price_minor": 1}])
    assert r.status_code == 201, r.text
    o = r.json()["order"]
    assert o["subtotal_minor"] == 2000000 and o["total_minor"] == 2000000 + settings.shipping_standard_fee
    assert o["status"] == "pending_payment" and o["payment_status"] == "unpaid"
    assert stock(db, a["id"]) == 3
    assert r.json()["payment"]["mode"] == "test" and "/pay/test/" in r.json()["payment"]["checkout_url"]
    assert client.get("/api/cart").json()["items"] == []  # cart emptied
    assert db.scalar(select(InventoryAdjustment.delta).where(InventoryAdjustment.order_id == db.scalar(select(Order.id)))) == -2


def test_order_items_are_snapshots(admin, client, catalog):
    a = catalog["a"]
    add(client, a["id"])
    num = checkout(client).json()["order"]["number"]
    body = {**admin.get(f"/api/admin/products/{a['id']}").json(), "name": "Renamed Bike", "price_minor": 1}
    body["specs"] = {k: v for k, v in body["specs"].items()}
    assert admin.put(f"/api/admin/products/{a['id']}", json=body).status_code == 200
    item = admin.get(f"/api/admin/orders/{num}").json()["items"][0]
    assert item["product_name"] == "Trail Alpha" and item["unit_price_minor"] == 1000000 and item["sku"] == "TA-1"


def test_cannot_buy_more_than_stock_and_nothing_changes(client, catalog, db, admin):
    b = catalog["b"]  # stock 2
    add(client, b["id"], 2)
    admin.post(f"/api/admin/inventory/{b['id']}/adjust", json={"delta": -1, "reason": "damaged in warehouse"})  # stock now 1
    r = checkout(client)
    assert r.status_code == 409 and "only 1 left" in r.json()["detail"].lower()
    assert stock(db, b["id"]) == 1 and db.scalar(select(Order.id)) is None
    assert client.get("/api/cart").json()["items"][0]["issue"] == "Only 1 left in stock."


def test_idempotency_key_prevents_double_orders(client, catalog, db):
    add(client, catalog["a"]["id"])
    r1 = checkout(client, key="same-key-123456")
    r2 = checkout(client, key="same-key-123456")  # double click / network retry
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["order"]["number"] == r2.json()["order"]["number"] and r2.json()["replayed"] is True
    assert len(db.scalars(select(Order.id)).all()) == 1 and stock(db, catalog["a"]["id"]) == 4
    assert checkout(client, key="same-key-123456", email="thief@example.com").status_code == 409


def test_discount_usage_is_counted_and_limited(admin, make_client, catalog):
    admin.post("/api/admin/discounts", json={"code": "ONCE", "percent_off": 20, "max_uses": 1})
    c1, c2 = make_client(), make_client()
    for c in (c1, c2):
        add(c, catalog["a"]["id"])
    assert checkout(c1, key="disc-key-0001", discount_code="ONCE").status_code == 201
    assert checkout(c2, key="disc-key-0002", discount_code="ONCE").status_code == 400


# ---------------- payments ----------------
def place(client, catalog, qty=1, **kw):
    add(client, catalog["a"]["id"], qty)
    r = checkout(client, **kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_success_page_does_not_mark_order_paid(client, catalog):
    d = place(client, catalog)
    num, tok = d["order"]["number"], d["order"]["access_token"]
    o = client.get(f"/api/orders/{num}", params={"token": tok}).json()  # what the "success page" can see
    assert o["status"] == "pending_payment" and o["payment_status"] == "unpaid"


def test_successful_test_payment_marks_paid(client, catalog, db):
    d = place(client, catalog)
    num, tok = d["order"]["number"], d["order"]["access_token"]
    r = client.post(f"/api/payments/test/{num}/simulate", params={"token": tok}, json={"outcome": "succeeded"})
    assert r.json() == {"result": "processed", "mode": "test"}
    o = client.get(f"/api/orders/{num}", params={"token": tok}).json()
    assert o["status"] == "paid" and o["payment_status"] == "paid" and o["paid_at"]
    assert stock(db, catalog["a"]["id"]) == 4  # stays reserved


def test_failed_payment_cancels_and_restocks(client, catalog, db):
    d = place(client, catalog, qty=2)
    num, tok = d["order"]["number"], d["order"]["access_token"]
    assert stock(db, catalog["a"]["id"]) == 3
    client.post(f"/api/payments/test/{num}/simulate", params={"token": tok}, json={"outcome": "failed"})
    o = client.get(f"/api/orders/{num}", params={"token": tok}).json()
    assert o["status"] == "cancelled" and o["payment_status"] == "failed"
    assert stock(db, catalog["a"]["id"]) == 5  # back


def test_webhook_rejects_bad_signature_and_stale_timestamp(client, catalog, db):
    d = place(client, catalog)
    pay = db.scalar(select(Payment))
    body, headers = signed_event(pay.provider_ref, "succeeded", pay.amount_minor)
    assert client.post("/api/webhooks/payments/test", content=body, headers={**headers, "X-Signature": "0" * 64}).status_code == 400
    assert client.post("/api/webhooks/payments/test", content=body, headers={k: v for k, v in headers.items() if k != "X-Signature"}).status_code == 400
    body2 = body.replace(b"succeeded", b"succeedee")  # tampered body, original signature
    assert client.post("/api/webhooks/payments/test", content=body2, headers=headers).status_code == 400
    old = {**headers, "X-Timestamp": str(int(time.time()) - 3600)}
    assert client.post("/api/webhooks/payments/test", content=body, headers=old).status_code == 400
    assert client.get(f"/api/orders/{d['order']['number']}", params={"token": d["order"]["access_token"]}).json()["payment_status"] == "unpaid"


def test_valid_webhook_is_processed_once_replay_is_ignored(client, catalog, db):
    d = place(client, catalog)
    pay = db.scalar(select(Payment))
    body, headers = signed_event(pay.provider_ref, "succeeded", pay.amount_minor)
    assert client.post("/api/webhooks/payments/test", content=body, headers=headers).json()["result"] == "processed"
    assert client.post("/api/webhooks/payments/test", content=body, headers=headers).json()["result"] == "duplicate"
    body2, headers2 = signed_event(pay.provider_ref, "succeeded", pay.amount_minor, event_id="another-event-id")
    assert client.post("/api/webhooks/payments/test", content=body2, headers=headers2).json()["result"] == "ignored"
    db.expire_all()
    assert db.scalar(select(Order.status)) == "paid"


def test_wrong_amount_is_never_marked_paid(client, catalog, db):
    d = place(client, catalog)
    pay = db.scalar(select(Payment))
    body, headers = signed_event(pay.provider_ref, "succeeded", 1)  # customer "paid" 1 franc
    client.post("/api/webhooks/payments/test", content=body, headers=headers)
    db.expire_all()
    o = db.scalar(select(Order))
    assert o.payment_status != "paid" and o.status == "needs_review"


def test_failure_event_after_payment_cannot_cancel_paid_order(client, catalog, db):
    d = place(client, catalog)
    num, tok = d["order"]["number"], d["order"]["access_token"]
    client.post(f"/api/payments/test/{num}/simulate", params={"token": tok}, json={"outcome": "succeeded"})
    pay = db.scalar(select(Payment))
    body, headers = signed_event(pay.provider_ref, "failed", pay.amount_minor, event_id="late-fail")
    client.post("/api/webhooks/payments/test", content=body, headers=headers)
    db.expire_all()
    assert db.scalar(select(Order.status)) == "paid"


def test_simulator_disabled_in_live_mode(client, catalog, monkeypatch):
    d = place(client, catalog)
    monkeypatch.setattr(settings, "payment_mode", "live")
    r = client.post(f"/api/payments/test/{d['order']['number']}/simulate", params={"token": d["order"]["access_token"]}, json={"outcome": "succeeded"})
    assert r.status_code == 404
    assert checkout(client, key="live-mode-key-1").status_code in (400, 503)  # test provider refused in live mode


def test_unconfigured_real_provider_gives_clear_error(client, catalog, monkeypatch):
    monkeypatch.setattr(settings, "payment_provider", "flutterwave")
    monkeypatch.setattr(settings, "payment_mode", "live")
    add(client, catalog["a"]["id"])
    r = checkout(client)
    assert r.status_code == 503 and "not configured" in r.json()["detail"]


def test_expired_unpaid_orders_release_stock(client, catalog, db, admin):
    d = place(client, catalog, qty=2)
    from sqlalchemy import update
    db.execute(update(Order).values(created_at=Order.created_at - __import__("datetime").timedelta(hours=2)))
    db.commit()
    assert admin.post("/api/admin/orders/release-expired").json() == {"released": 1}
    assert stock(db, catalog["a"]["id"]) == 5
    assert admin.post("/api/admin/orders/release-expired").json() == {"released": 0}  # not released twice
    assert stock(db, catalog["a"]["id"]) == 5


def test_customer_can_cancel_unpaid_order_once(client, catalog, db):
    d = place(client, catalog)
    url = f"/api/orders/{d['order']['number']}/cancel"
    assert client.post(url, params={"token": d["order"]["access_token"]}).json()["status"] == "cancelled"
    assert client.post(url, params={"token": d["order"]["access_token"]}).status_code == 409
    assert stock(db, catalog["a"]["id"]) == 5


# ---------------- access control ----------------
def test_orders_are_private_to_their_owner(make_client, catalog):
    alice = make_client()
    alice.post("/api/auth/register", json={"email": "alice@example.com", "password": "Passw0rd-long1", "full_name": "Alice A"})
    add(alice, catalog["a"]["id"])
    num = checkout(alice, email="alice@example.com").json()["order"]["number"]
    assert alice.get(f"/api/orders/{num}").status_code == 200
    assert [o["number"] for o in alice.get("/api/orders").json()] == [num]
    mallory = make_client()
    mallory.post("/api/auth/register", json={"email": "mallory@example.com", "password": "Passw0rd-long1", "full_name": "Mallory M"})
    assert mallory.get(f"/api/orders/{num}").status_code == 404
    assert mallory.get("/api/orders").json() == []
    assert make_client().get(f"/api/orders/{num}").status_code == 404
    assert make_client().get(f"/api/orders/{num}", params={"token": "guess"}).status_code == 404
    assert mallory.post(f"/api/payments/test/{num}/simulate", json={"outcome": "succeeded"}).status_code == 404


# ---------------- overselling under concurrency ----------------
def test_concurrent_buyers_cannot_oversell(admin, make_client, db):
    cat = admin.post("/api/admin/categories", json={"name": "Race"}).json()
    p = admin.post("/api/admin/products", json={"name": "Last Bikes", "sku": "RACE-1", "price_minor": 100000, "stock_quantity": 3,
                                                "category_id": cat["id"], "is_published": True}).json()
    clients = [make_client() for _ in range(12)]
    for c in clients:
        assert add(c, p["id"], 1).status_code == 200
    results, barrier = [], threading.Barrier(len(clients))

    def buy(i, c):
        barrier.wait()
        results.append(checkout(c, key=f"race-key-{i:04d}").status_code)

    threads = [threading.Thread(target=buy, args=(i, c)) for i, c in enumerate(clients)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results).count(201) == 3 and results.count(409) == 9, results
    assert stock(db, p["id"]) == 0
    assert len(db.scalars(select(Order.id)).all()) == 3


def test_database_refuses_negative_stock(db):
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    db.execute(text("INSERT INTO products (name, slug, description, sku, price_minor) VALUES ('x','x','','X',100)"))
    with pytest.raises(IntegrityError):
        db.execute(text("INSERT INTO inventory (product_id, quantity) SELECT id, -1 FROM products"))
        db.commit()
