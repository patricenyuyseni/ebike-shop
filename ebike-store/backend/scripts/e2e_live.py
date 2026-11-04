"""End-to-end check against RUNNING servers (test mode). A customer registers, buys a bike and pays with the simulated
provider; the admin then fulfils the order. Usage (servers must be running, demo data seeded):
  BASE_URL=http://localhost:5173 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' python scripts/e2e_live.py
It creates a real customer account + order in the database it points at: use a DEVELOPMENT database only."""
import os
import sys
import uuid

import httpx

BASE = os.environ.get("BASE_URL", "http://localhost:5173")
ORIGIN = os.environ.get("ORIGIN", "http://localhost:5173")
steps = []


def check(name, cond, extra=""):
    steps.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (extra and not cond) else ""))
    if not cond:
        print("Stopping at first failure.")
        sys.exit(1)


def browser():
    c = httpx.Client(base_url=BASE, headers={"Origin": ORIGIN}, timeout=30)
    c.headers["X-CSRF-Token"] = c.get("/api/auth/csrf").json()["csrf_token"]
    return c


def main():
    if os.environ.get("APP_ENV") == "production":
        sys.exit("Refusing to run against production.")
    cfg = httpx.get(f"{BASE}/api/config").json()
    check("store is in TEST payment mode", cfg["payment_mode"] == "test")

    shop = browser()
    items = shop.get("/api/products", params={"in_stock": "true", "sort": "price_asc"}).json()["items"]
    check("catalogue comes from the database", len(items) > 0)
    found = shop.get("/api/products", params={"q": items[0]["name"].split()[0]}).json()
    check("search finds products", found["total"] >= 1)
    bike = items[0]
    detail = shop.get(f"/api/products/{bike['slug']}").json()
    check("product detail has specs", detail["specs"] is not None)

    cart = shop.post("/api/cart/items", json={"product_id": bike["id"], "quantity": 2}).json()
    check("guest adds to cart", cart["item_count"] == 2 and cart["subtotal_minor"] == 2 * bike["price_minor"])
    cart = shop.patch(f"/api/cart/items/{bike['id']}", json={"quantity": 1}).json()
    check("guest changes quantity", cart["item_count"] == 1)

    email = f"e2e-{uuid.uuid4().hex[:8]}@example.com"
    reg = shop.post("/api/auth/register", json={"email": email, "password": "E2e-Passw0rd-1", "full_name": "E2E Buyer", "phone": "+237 600 111 222"})
    check("customer registers", reg.status_code == 201, reg.text)
    check("guest cart merged into account", shop.get("/api/cart").json()["item_count"] == 1)

    q = shop.post("/api/checkout/quote", json={"shipping_method": "standard"}).json()
    check("server quote = subtotal + shipping", q["total_minor"] == bike["price_minor"] + cfg["shipping"]["standard"])

    addr = {"email": email, "full_name": "E2E Buyer", "phone": "+237 600 111 222", "line1": "1 Test Street", "city": "Yaoundé", "region": "Centre", "country": "CM", "shipping_method": "standard"}
    key = f"e2e-{uuid.uuid4()}"
    co = shop.post("/api/checkout", json={**addr, "price_minor": 1}, headers={"Idempotency-Key": key})
    check("checkout creates an order", co.status_code == 201, co.text)
    order = co.json()["order"]
    check("order uses server price (browser price ignored)", order["total_minor"] == q["total_minor"])
    dup = shop.post("/api/checkout", json=addr, headers={"Idempotency-Key": key}).json()
    check("double-submit returns the SAME order", dup["order"]["number"] == order["number"])
    num = order["number"]

    status = shop.get(f"/api/orders/{num}").json()
    check("order is NOT paid before payment is verified", status["payment_status"] == "unpaid" and status["status"] == "pending_payment")

    pay = shop.post(f"/api/payments/test/{num}/simulate", json={"outcome": "succeeded"})
    check("test payment verified via signed webhook path", pay.status_code == 200 and pay.json()["result"] == "processed", pay.text)
    status = shop.get(f"/api/orders/{num}").json()
    check("order is now paid", status["status"] == "paid" and status["payment_status"] == "paid")
    check("order appears in customer history", num in [o["number"] for o in shop.get("/api/orders").json()])

    stranger = browser()
    check("another visitor cannot read the order", stranger.get(f"/api/orders/{num}").status_code == 404)
    check("customer cannot open admin API", shop.get("/api/admin/dashboard").status_code == 403)

    adm = browser()
    r = adm.post("/api/admin/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]})
    check("admin signs in", r.status_code == 200, r.text)
    dash = adm.get("/api/admin/dashboard").json()
    check("dashboard shows verified revenue and order to fulfil", dash["revenue_minor"] >= order["total_minor"] and dash["pending_orders"] >= 1)
    check("admin finds the order by search", adm.get("/api/admin/orders", params={"q": email}).json()["total"] == 1)
    ship = adm.patch(f"/api/admin/orders/{num}/status", json={"status": "shipped", "carrier": "TestCarrier", "tracking_number": "TRK-E2E-1"})
    check("admin ships with tracking number", ship.status_code == 200 and ship.json()["status"] == "shipped", ship.text)
    check("customer sees tracking", shop.get(f"/api/orders/{num}").json()["tracking"]["tracking_number"] == "TRK-E2E-1")
    csv = adm.get("/api/admin/orders/export.csv")
    check("admin exports CSV", csv.status_code == 200 and num in csv.text)

    p = adm.post("/api/admin/products", json={"name": f"E2E Bike {uuid.uuid4().hex[:6]}", "sku": f"E2E-{uuid.uuid4().hex[:8]}", "price_minor": 123000, "stock_quantity": 3, "is_published": True}).json()
    check("admin creates and publishes a product", shop.get(f"/api/products/{p['slug']}").status_code == 200)
    up = adm.post(f"/api/admin/products/{p['id']}/images", files={"file": ("x.png", b"not really an image", "image/png")})
    check("upload of a fake image is rejected (or says Cloudinary is not configured)", up.status_code in (400, 503), up.text)
    adm.delete(f"/api/admin/products/{p['id']}")

    print(f"\nAll {len(steps)} end-to-end checks passed.")


main()
