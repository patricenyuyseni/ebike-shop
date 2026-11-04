import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_perm
from app.models import (AuditLog, Category, DiscountCode, Inventory, InventoryAdjustment, Order, OrderItem, Payment, Product,
                        ProductImage, ProductSpec, Review, Shipment, User)
from app.schemas.api import (AdjustIn, CategoryIn, DiscountIn, ImageOrderIn, OrderStatusIn, ProductIn, ThresholdIn, TrackingIn)
from app.services import mailer, storage
from app.services.common import audit, escape_like, log, unique_slug
from app.services.orders import expire_unpaid, lock_inventory, release_stock
from app.services.serializers import admin_product, order_out

router = APIRouter(prefix="/api/admin")
MAX_IMAGES = 10

class ShippingCostIn(BaseModel):
    # Amount in USD cents (for example, 25.50 USD = 2550).
    shipping_minor: int = Field(ge=0, le=100000000)



def page_of(total: int, page: int, size: int) -> dict:
    return {"total": total, "page": page, "page_size": size, "pages": max(1, -(-total // size))}


# ======================= dashboard =======================
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require_perm("dashboard:read"))):
    live = and_(Product.is_archived.is_(False))
    low = db.execute(select(Product.id, Product.name, Product.sku, Inventory.quantity, Inventory.low_stock_threshold)
                     .join(Inventory, Inventory.product_id == Product.id)
                     .where(live, Inventory.quantity <= Inventory.low_stock_threshold).order_by(Inventory.quantity).limit(10)).all()
    revenue = db.scalar(select(func.coalesce(func.sum(Payment.amount_minor), 0)).where(Payment.status == "succeeded")) or 0
    recent = db.scalars(select(Order).order_by(Order.created_at.desc()).limit(8)).all()
    return {
        "currency": settings.currency,
        "product_count": db.scalar(select(func.count(Product.id)).where(live)),
        "published_count": db.scalar(select(func.count(Product.id)).where(live, Product.is_published.is_(True))),
        "pending_orders": db.scalar(select(func.count(Order.id)).where(Order.status.in_(["paid", "processing", "needs_review"]))),
        "awaiting_payment": db.scalar(select(func.count(Order.id)).where(Order.status == "pending_payment")),
        "low_stock_count": db.scalar(select(func.count(Inventory.id)).join(Product, Product.id == Inventory.product_id)
                                     .where(live, Inventory.quantity <= Inventory.low_stock_threshold)),
        "revenue_minor": int(revenue),  # only payments verified by a signed provider webhook
        "low_stock": [{"id": r.id, "name": r.name, "sku": r.sku, "quantity": r.quantity, "threshold": r.low_stock_threshold} for r in low],
        "recent_orders": [order_out(o, admin=True) for o in recent],
    }


# ======================= categories =======================
def cat_out(c: Category, n: int = 0) -> dict:
    return {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "sort_order": c.sort_order,
            "is_published": c.is_published, "is_archived": c.is_archived, "product_count": n}


@router.get("/categories")
def admin_categories(db: Session = Depends(get_db), user: User = Depends(require_perm("categories:write"))):
    counts = dict(db.execute(select(Product.category_id, func.count()).group_by(Product.category_id)).all())
    return [cat_out(c, counts.get(c.id, 0)) for c in db.scalars(select(Category).order_by(Category.sort_order, Category.name))]


@router.post("/categories", status_code=201)
def create_category(body: CategoryIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("categories:write"))):
    c = Category(name=body.name.strip(), slug=unique_slug(db, Category, body.name), description=body.description,
                 sort_order=body.sort_order, is_published=body.is_published)
    db.add(c)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A category with this name already exists.")
    audit(db, user, "category.created", "category", c.id, {"name": c.name}, request)
    db.commit()
    return cat_out(c)


def _cat(db, cid) -> Category:
    c = db.get(Category, cid)
    if not c:
        raise HTTPException(404, "Category not found.")
    return c


@router.put("/categories/{cid}")
def update_category(cid: int, body: CategoryIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("categories:write"))):
    c = _cat(db, cid)
    c.name, c.description, c.sort_order, c.is_published = body.name.strip(), body.description, body.sort_order, body.is_published
    try:
        audit(db, user, "category.updated", "category", c.id, {"name": c.name}, request)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A category with this name already exists.")
    return cat_out(c)


@router.delete("/categories/{cid}")
def delete_category(cid: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("categories:write"))):
    c = _cat(db, cid)
    n = db.scalar(select(func.count(Product.id)).where(Product.category_id == cid))
    if n:  # has bikes: archive (hide) instead of deleting
        c.is_archived, c.is_published = True, False
        result = "archived"
    else:
        db.delete(c)
        result = "deleted"
    audit(db, user, f"category.{result}", "category", cid, None, request)
    db.commit()
    return {"result": result}


# ======================= products =======================
def _apply_specs(p: Product, specs) -> None:
    data = specs.model_dump() if specs else {}
    if p.specs is None:
        p.specs = ProductSpec(**data)
    else:
        for k, v in data.items():
            setattr(p.specs, k, v)


def _load(db: Session, pid: int) -> Product:
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "Product not found.")
    return p


def _check_category(db, cid):
    if cid is not None and not db.get(Category, cid):
        raise HTTPException(400, "Selected category does not exist.")


@router.get("/products")
def admin_list_products(q: str | None = Query(None, max_length=100), status: str | None = Query(None, pattern="^(published|draft|archived)$"),
                        category_id: int | None = None, low_stock: bool = False, featured: bool | None = None,
                        page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                        db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    def apply(stmt):
        stmt = stmt.outerjoin(Inventory, Inventory.product_id == Product.id)
        for term in (q or "").split()[:6]:
            like = f"%{escape_like(term)}%"
            stmt = stmt.where(or_(Product.name.ilike(like, escape="\\"), Product.sku.ilike(like, escape="\\")))
        if status == "archived":
            stmt = stmt.where(Product.is_archived.is_(True))
        elif status == "published":
            stmt = stmt.where(Product.is_archived.is_(False), Product.is_published.is_(True))
        elif status == "draft":
            stmt = stmt.where(Product.is_archived.is_(False), Product.is_published.is_(False))
        else:
            stmt = stmt.where(Product.is_archived.is_(False))
        if category_id:
            stmt = stmt.where(Product.category_id == category_id)
        if low_stock:
            stmt = stmt.where(Inventory.quantity <= Inventory.low_stock_threshold)
        if featured is not None:
            stmt = stmt.where(Product.is_featured.is_(featured))
        return stmt
    total = db.scalar(apply(select(func.count(Product.id)).select_from(Product)))
    rows = db.scalars(apply(select(Product)).order_by(Product.updated_at.desc(), Product.id.desc()).limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [admin_product(p) for p in rows], **page_of(total, page, page_size)}


@router.get("/products/{pid}")
def admin_get_product(pid: int, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    return admin_product(_load(db, pid))


@router.post("/products", status_code=201)
def create_product(body: ProductIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    _check_category(db, body.category_id)
    p = Product(name=body.name.strip(), slug=unique_slug(db, Product, body.name), description=body.description, sku=body.sku.strip(),
                price_minor=body.price_minor, original_price_minor=body.original_price_minor, category_id=body.category_id,
                is_published=body.is_published, is_featured=body.is_featured)
    p.inventory = Inventory(quantity=body.stock_quantity, low_stock_threshold=body.low_stock_threshold)
    _apply_specs(p, body.specs)
    db.add(p)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A product with this SKU already exists.")
    if body.stock_quantity:
        db.add(InventoryAdjustment(product_id=p.id, delta=body.stock_quantity, quantity_after=body.stock_quantity, reason="initial stock", user_id=user.id))
    audit(db, user, "product.created", "product", p.id, {"sku": p.sku, "name": p.name}, request)
    db.commit()
    return admin_product(_load(db, p.id))


@router.put("/products/{pid}")
def update_product(pid: int, body: ProductIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    p = _load(db, pid)
    _check_category(db, body.category_id)
    p.name, p.description, p.sku = body.name.strip(), body.description, body.sku.strip()
    p.price_minor, p.original_price_minor, p.category_id = body.price_minor, body.original_price_minor, body.category_id
    p.is_published, p.is_featured = body.is_published, body.is_featured
    _apply_specs(p, body.specs)
    inv = lock_inventory(db, [p.id]).get(p.id)
    inv.low_stock_threshold = body.low_stock_threshold
    delta = body.stock_quantity - inv.quantity
    if delta:
        inv.quantity += delta
        db.add(InventoryAdjustment(product_id=p.id, delta=delta, quantity_after=inv.quantity, reason="edited in product form", user_id=user.id))
    try:
        audit(db, user, "product.updated", "product", p.id, {"sku": p.sku, "price": p.price_minor}, request)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A product with this SKU already exists.")
    return admin_product(_load(db, pid))


class FlagsIn(BaseModel):
    is_published: bool | None = None
    is_featured: bool | None = None
    is_archived: bool | None = None


@router.patch("/products/{pid}/flags")
def product_flags(pid: int, body: FlagsIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    p = _load(db, pid)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    if p.is_archived:
        p.is_published = False
    audit(db, user, "product.flags", "product", p.id, body.model_dump(exclude_none=True), request)
    db.commit()
    return admin_product(p)


@router.delete("/products/{pid}")
def delete_product(pid: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    """Products that were ever ordered are only ARCHIVED (order history stays intact). Others are deleted."""
    p = _load(db, pid)
    ordered = db.scalar(select(func.count(OrderItem.id)).where(OrderItem.product_id == pid))
    if ordered:
        p.is_archived, p.is_published = True, False
        result, public_ids = "archived", []
    else:
        public_ids = [i.public_id for i in p.images]
        db.delete(p)
        result = "deleted"
    audit(db, user, f"product.{result}", "product", pid, {"sku": p.sku}, request)
    db.commit()
    for pub in public_ids:
        storage.delete_image(pub)
    return {"result": result}


# ======================= product images =======================
@router.post("/products/{pid}/images", status_code=201)
async def upload_product_image(pid: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                               user: User = Depends(require_perm("products:write"))):
    p = _load(db, pid)
    if not settings.cloudinary_configured:
        raise HTTPException(503, "Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and "
                                 "CLOUDINARY_API_SECRET in backend/.env and restart the server (see README > Cloudinary).")
    if len(p.images) >= MAX_IMAGES:
        raise HTTPException(400, f"A bike can have at most {MAX_IMAGES} images.")
    raw = await storage.read_limited(file)
    clean, _ext = storage.validate_and_clean(raw)
    try:
        url, public_id = await run_in_threadpool(storage.upload_image, clean)
    except storage.StorageNotConfigured:
        raise HTTPException(503, "Image uploads are not configured on the server.")
    except Exception:
        log.exception("Cloudinary upload failed")
        raise HTTPException(502, "The image service rejected the upload. Check your Cloudinary keys and try again.")
    db.refresh(p)
    img = ProductImage(product_id=p.id, url=url, public_id=public_id, alt_text=p.name,
                       position=(max([i.position for i in p.images], default=-1) + 1), is_primary=not p.images)
    db.add(img)
    audit(db, user, "product.image_added", "product", p.id, {"public_id": public_id}, request)
    db.commit()
    return {"id": img.id, "url": img.url, "is_primary": img.is_primary, "position": img.position}


@router.patch("/products/{pid}/images/{iid}/primary")
def make_primary(pid: int, iid: int, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    img = db.scalar(select(ProductImage).where(ProductImage.id == iid, ProductImage.product_id == pid))
    if not img:
        raise HTTPException(404, "Image not found.")
    db.execute(update(ProductImage).where(ProductImage.product_id == pid).values(is_primary=False))
    db.execute(update(ProductImage).where(ProductImage.id == iid).values(is_primary=True))
    db.commit()
    return admin_product(_load(db, pid))["images"]


@router.put("/products/{pid}/images/order")
def reorder_images(pid: int, body: ImageOrderIn, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    p = _load(db, pid)
    if sorted(body.image_ids) != sorted(i.id for i in p.images):
        raise HTTPException(400, "The list must contain every image of this product exactly once.")
    pos = {iid: n for n, iid in enumerate(body.image_ids)}
    for i in p.images:
        i.position = pos[i.id]
    db.commit()
    db.refresh(p)
    return admin_product(p)["images"]


@router.delete("/products/{pid}/images/{iid}")
def delete_image(pid: int, iid: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("products:write"))):
    img = db.scalar(select(ProductImage).where(ProductImage.id == iid, ProductImage.product_id == pid))
    if not img:
        raise HTTPException(404, "Image not found.")
    public_id, was_primary = img.public_id, img.is_primary
    db.delete(img)
    db.flush()
    if was_primary:
        nxt = db.scalar(select(ProductImage).where(ProductImage.product_id == pid).order_by(ProductImage.position, ProductImage.id).limit(1))
        if nxt:
            nxt.is_primary = True
    audit(db, user, "product.image_removed", "product", pid, {"public_id": public_id}, request)
    db.commit()
    storage.delete_image(public_id)
    return {"ok": True}


# ======================= inventory =======================
@router.get("/inventory")
def inventory_list(low_stock: bool = False, q: str | None = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                   db: Session = Depends(get_db), user: User = Depends(require_perm("inventory:manage"))):
    base = select(Product.id, Product.name, Product.sku, Product.is_archived, Inventory.quantity, Inventory.low_stock_threshold) \
        .join(Inventory, Inventory.product_id == Product.id).where(Product.is_archived.is_(False))
    if low_stock:
        base = base.where(Inventory.quantity <= Inventory.low_stock_threshold)
    if q:
        like = f"%{escape_like(q)}%"
        base = base.where(or_(Product.name.ilike(like, escape="\\"), Product.sku.ilike(like, escape="\\")))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.execute(base.order_by(Inventory.quantity, Product.name).limit(page_size).offset((page - 1) * page_size)).all()
    return {"items": [{"product_id": r.id, "name": r.name, "sku": r.sku, "quantity": r.quantity, "threshold": r.low_stock_threshold,
                       "status": "out_of_stock" if r.quantity == 0 else "low_stock" if r.quantity <= r.low_stock_threshold else "in_stock"} for r in rows],
            **page_of(total, page, page_size)}


@router.post("/inventory/{pid}/adjust")
def adjust_inventory(pid: int, body: AdjustIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("inventory:manage"))):
    _load(db, pid)
    inv = lock_inventory(db, [pid]).get(pid)
    if inv.quantity + body.delta < 0:
        raise HTTPException(409, f"Cannot remove {-body.delta}: only {inv.quantity} in stock.")
    inv.quantity += body.delta
    db.add(InventoryAdjustment(product_id=pid, delta=body.delta, quantity_after=inv.quantity, reason=body.reason.strip(), user_id=user.id))
    audit(db, user, "inventory.adjusted", "product", pid, {"delta": body.delta, "reason": body.reason}, request)
    db.commit()
    return {"product_id": pid, "quantity": inv.quantity}


@router.put("/inventory/{pid}/threshold")
def set_threshold(pid: int, body: ThresholdIn, db: Session = Depends(get_db), user: User = Depends(require_perm("inventory:manage"))):
    inv = lock_inventory(db, [pid]).get(pid)
    if not inv:
        raise HTTPException(404, "Product not found.")
    inv.low_stock_threshold = body.low_stock_threshold
    db.commit()
    return {"product_id": pid, "threshold": inv.low_stock_threshold}


@router.get("/inventory/{pid}/history")
def inventory_history(pid: int, db: Session = Depends(get_db), user: User = Depends(require_perm("inventory:manage"))):
    rows = db.scalars(select(InventoryAdjustment).where(InventoryAdjustment.product_id == pid).order_by(InventoryAdjustment.id.desc()).limit(100)).all()
    return [{"delta": r.delta, "quantity_after": r.quantity_after, "reason": r.reason, "created_at": r.created_at.isoformat()} for r in rows]


# ======================= orders =======================
def _orders_query(q, status, payment_status):
    stmt = select(Order)
    if q:
        like = f"%{escape_like(q.strip())}%"
        stmt = stmt.where(or_(Order.number.ilike(like, escape="\\"), Order.email.ilike(like, escape="\\"), Order.customer_name.ilike(like, escape="\\")))
    if status:
        stmt = stmt.where(Order.status == status)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    return stmt


@router.get("/orders")
def admin_orders(q: str | None = Query(None, max_length=100), status: str | None = Query(None, max_length=20), payment_status: str | None = Query(None, max_length=20),
                 page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(require_perm("orders:manage"))):
    stmt = _orders_query(q, status, payment_status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Order.created_at.desc(), Order.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
    return {"items": [order_out(o, admin=True) for o in rows], **page_of(total, page, page_size)}


def _csv_safe(v):
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s  # blocks spreadsheet formula injection


@router.get("/orders/export.csv")
def export_orders(q: str | None = None, status: str | None = None, payment_status: str | None = None, request: Request = None,
                  db: Session = Depends(get_db), user: User = Depends(require_perm("orders:manage"))):
    rows = db.scalars(_orders_query(q, status, payment_status).order_by(Order.created_at.desc()).limit(10000)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["order_number", "created_at", "status", "payment_status", "customer", "email", "phone", "city", "region", "country",
                "items", "subtotal", "discount", "shipping", "tax", "total", "currency", "tracking_number"])
    for o in rows:
        w.writerow([_csv_safe(x) for x in [o.number, o.created_at.isoformat(), o.status, o.payment_status, o.customer_name, o.email, o.phone,
                    o.ship_city, o.ship_region, o.ship_country, "; ".join(f"{i.quantity}x {i.product_name}" for i in o.items),
                    o.subtotal_minor, o.discount_minor, o.shipping_minor, o.tax_minor, o.total_minor, o.currency,
                    o.shipment.tracking_number if o.shipment else ""]])
    audit(db, user, "orders.exported", None, None, {"rows": len(rows)}, request)
    db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="orders.csv"'})


@router.post("/orders/release-expired")
def release_expired(db: Session = Depends(get_db), user: User = Depends(require_perm("orders:manage"))):
    return {"released": expire_unpaid(db)}


def _order(db, number, lock=False) -> Order:
    q = select(Order).where(Order.number == number)
    o = db.scalar(q.with_for_update() if lock else q)
    if not o:
        raise HTTPException(404, "Order not found.")
    return o


@router.get("/orders/{number}")
def admin_order(number: str, db: Session = Depends(get_db), user: User = Depends(require_perm("orders:manage"))):
    return order_out(_order(db, number), admin=True)


@router.put("/orders/{number}/shipping-cost")
def update_shipping_cost(
    number: str,
    body: ShippingCostIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("orders:manage")),
):
    o = _order(db, number, lock=True)

    if o.status == "cancelled":
        raise HTTPException(409, "Shipping cost cannot be changed for a cancelled order.")

    previous_shipping = o.shipping_minor
    o.shipping_minor = body.shipping_minor
    o.total_minor = o.subtotal_minor - o.discount_minor + o.shipping_minor + o.tax_minor

    audit(
        db, user, "order.shipping_cost", "order", o.number,
        {
            "previous_shipping_minor": previous_shipping,
            "shipping_minor": o.shipping_minor,
            "total_minor": o.total_minor,
            "payment_status": o.payment_status,
        },
        request,
    )
    db.commit()
    db.refresh(o)
    return order_out(o, admin=True)


TRANSITIONS = {
    "pending_payment": {"cancelled"},
    "paid": {"processing", "shipped", "cancelled"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "needs_review": {"processing", "cancelled"},
}


@router.patch("/orders/{number}/status")
def update_status(number: str, body: OrderStatusIn, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db),
                  user: User = Depends(require_perm("orders:manage"))):
    o = _order(db, number, lock=True)
    if body.status not in TRANSITIONS.get(o.status, set()):
        raise HTTPException(409, f"An order that is '{o.status}' cannot be changed to '{body.status}'.")
    if body.status in ("processing", "shipped") and o.payment_status != "paid":
        raise HTTPException(409, "Only orders with a verified payment can be fulfilled.")
    if body.status == "processing" and o.stock_released:
        raise HTTPException(409, "Stock for this order was already released. Adjust inventory first.")
    if body.status == "shipped":
        tn = body.tracking_number or (o.shipment.tracking_number if o.shipment else None)
        if not tn:
            raise HTTPException(400, "Enter a tracking number before marking the order as shipped.")
        _set_tracking(o, body.carrier, tn)
        o.shipment.shipped_at = datetime.now(timezone.utc)
    previous = o.status
    if body.status == "cancelled":
        release_stock(db, o, "cancelled by admin")
        if o.payment_status == "paid":
            o.payment_status = "refund_due"  # money must be refunded manually in the provider dashboard
    o.status = body.status
    audit(db, user, "order.status", "order", o.number, {"from": previous, "to": body.status}, request)
    db.commit()
    if body.status == "shipped":
        subject, text = mailer.shipping_update(o)
        bg.add_task(mailer.send_email, o.email, subject, text)
    return order_out(o, admin=True)


def _set_tracking(o: Order, carrier, number):
    if o.shipment is None:
        o.shipment = Shipment(carrier=carrier, tracking_number=number)
    else:
        o.shipment.carrier, o.shipment.tracking_number = carrier or o.shipment.carrier, number


@router.put("/orders/{number}/tracking")
def set_tracking(number: str, body: TrackingIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("orders:manage"))):
    o = _order(db, number, lock=True)
    _set_tracking(o, body.carrier, body.tracking_number.strip())
    audit(db, user, "order.tracking", "order", o.number, {"tracking": body.tracking_number}, request)
    db.commit()
    return order_out(o, admin=True)


# ======================= discounts / reviews / audit =======================
def disc_out(d: DiscountCode) -> dict:
    return {"id": d.id, "code": d.code, "percent_off": d.percent_off, "amount_off_minor": d.amount_off_minor, "is_active": d.is_active,
            "max_uses": d.max_uses, "used_count": d.used_count}


@router.get("/discounts")
def list_discounts(db: Session = Depends(get_db), user: User = Depends(require_perm("discounts:manage"))):
    return [disc_out(d) for d in db.scalars(select(DiscountCode).order_by(DiscountCode.id.desc()))]


@router.post("/discounts", status_code=201)
def create_discount(body: DiscountIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_perm("discounts:manage"))):
    d = DiscountCode(code=body.code.upper(), percent_off=body.percent_off, amount_off_minor=body.amount_off_minor, max_uses=body.max_uses, is_active=body.is_active)
    db.add(d)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This code already exists.")
    audit(db, user, "discount.created", "discount", d.id, {"code": d.code}, request)
    db.commit()
    return disc_out(d)


@router.patch("/discounts/{did}/toggle")
def toggle_discount(did: int, db: Session = Depends(get_db), user: User = Depends(require_perm("discounts:manage"))):
    d = db.get(DiscountCode, did)
    if not d:
        raise HTTPException(404, "Discount not found.")
    d.is_active = not d.is_active
    db.commit()
    return disc_out(d)


@router.get("/reviews")
def pending_reviews(db: Session = Depends(get_db), user: User = Depends(require_perm("reviews:moderate"))):
    rows = db.scalars(select(Review).where(Review.is_approved.is_(False)).order_by(Review.id.desc()).limit(100)).unique().all()
    return [{"id": r.id, "product_id": r.product_id, "rating": r.rating, "title": r.title, "body": r.body, "email": r.user.email} for r in rows]


@router.post("/reviews/{rid}/approve")
def approve_review(rid: int, db: Session = Depends(get_db), user: User = Depends(require_perm("reviews:moderate"))):
    r = db.get(Review, rid)
    if not r:
        raise HTTPException(404, "Review not found.")
    r.is_approved = True
    db.commit()
    return {"ok": True}


@router.delete("/reviews/{rid}")
def delete_review(rid: int, db: Session = Depends(get_db), user: User = Depends(require_perm("reviews:moderate"))):
    r = db.get(Review, rid)
    if r:
        db.delete(r)
        db.commit()
    return {"ok": True}


@router.get("/audit-logs")
def audit_logs(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), action: str | None = Query(None, max_length=60),
               db: Session = Depends(get_db), user: User = Depends(require_perm("audit:read"))):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
    return {"items": [{"id": r.id, "actor_user_id": r.actor_user_id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id,
                       "detail": r.detail, "ip": r.ip, "created_at": r.created_at.isoformat()} for r in rows], **page_of(total, page, page_size)}
