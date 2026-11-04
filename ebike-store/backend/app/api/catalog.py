from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_user
from app.models import Category, Inventory, Order, OrderItem, Product, ProductSpec, Review, User
from app.schemas.api import ReviewIn
from app.services.common import escape_like
from app.services.serializers import product_card, product_detail

router = APIRouter(prefix="/api")


def _public(stmt):
    return (stmt.outerjoin(Category, Product.category_id == Category.id)
            .outerjoin(ProductSpec, ProductSpec.product_id == Product.id)
            .outerjoin(Inventory, Inventory.product_id == Product.id)
            .where(Product.is_published.is_(True), Product.is_archived.is_(False),
                   or_(Product.category_id.is_(None), and_(Category.is_published.is_(True), Category.is_archived.is_(False)))))


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Product.category_id, func.count()).where(Product.is_published.is_(True), Product.is_archived.is_(False))
                             .group_by(Product.category_id)).all())
    cats = db.scalars(select(Category).where(Category.is_published.is_(True), Category.is_archived.is_(False))
                      .order_by(Category.sort_order, Category.name)).all()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "image_url": c.image_url,
             "product_count": counts.get(c.id, 0)} for c in cats]


@router.get("/products")
def list_products(
    q: str | None = Query(None, max_length=100), category: str | None = Query(None, max_length=100),
    min_price: int | None = Query(None, ge=0), max_price: int | None = Query(None, ge=0),
    min_range_km: int | None = Query(None, ge=0), min_motor_w: int | None = Query(None, ge=0),
    frame_material: str | None = Query(None, max_length=60), in_stock: bool = False, featured: bool | None = None,
    sort: Literal["newest", "price_asc", "price_desc", "name"] = "newest",
    page: int = Query(1, ge=1, le=10000), page_size: int = Query(12, ge=1, le=48), db: Session = Depends(get_db),
):
    def apply(stmt):
        stmt = _public(stmt)
        for term in (q or "").split()[:6]:
            like = f"%{escape_like(term)}%"
            stmt = stmt.where(or_(Product.name.ilike(like, escape="\\"), Product.description.ilike(like, escape="\\"),
                                  Product.sku.ilike(like, escape="\\"), Category.name.ilike(like, escape="\\")))
        if category:
            stmt = stmt.where(Category.slug == category)
        if min_price is not None:
            stmt = stmt.where(Product.price_minor >= min_price)
        if max_price is not None:
            stmt = stmt.where(Product.price_minor <= max_price)
        if min_range_km is not None:
            stmt = stmt.where(ProductSpec.range_km >= min_range_km)
        if min_motor_w is not None:
            stmt = stmt.where(ProductSpec.motor_power_w >= min_motor_w)
        if frame_material:
            stmt = stmt.where(func.lower(ProductSpec.frame_material) == frame_material.lower())
        if in_stock:
            stmt = stmt.where(Inventory.quantity > 0)
        if featured is not None:
            stmt = stmt.where(Product.is_featured.is_(featured))
        return stmt

    total = db.scalar(apply(select(func.count(Product.id)).select_from(Product))) or 0
    order = {"newest": [Product.created_at.desc(), Product.id.desc()], "price_asc": [Product.price_minor, Product.id],
             "price_desc": [Product.price_minor.desc(), Product.id], "name": [func.lower(Product.name), Product.id]}[sort]
    rows = db.scalars(apply(select(Product)).order_by(*order).limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [product_card(p) for p in rows], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


def _get_public_product(db: Session, slug: str) -> Product:
    p = db.scalar(_public(select(Product)).where(Product.slug == slug))
    if not p:
        raise HTTPException(404, "Bike not found.")
    return p


@router.get("/products/{slug}")
def product(slug: str, db: Session = Depends(get_db)):
    p = _get_public_product(db, slug)
    related = []
    if p.category_id:
        related = db.scalars(_public(select(Product)).where(Product.category_id == p.category_id, Product.id != p.id)
                             .order_by(Product.is_featured.desc(), Product.id.desc()).limit(4)).unique().all()
    return {**product_detail(p), "related": [product_card(r) for r in related]}


@router.get("/products/{slug}/reviews")
def reviews(slug: str, db: Session = Depends(get_db)):
    p = _get_public_product(db, slug)
    rows = db.scalars(select(Review).where(Review.product_id == p.id, Review.is_approved.is_(True)).order_by(Review.created_at.desc()).limit(50)).unique().all()
    avg = db.scalar(select(func.avg(Review.rating)).where(Review.product_id == p.id, Review.is_approved.is_(True)))
    return {"count": len(rows), "average": round(float(avg), 1) if avg else None,
            "items": [{"id": r.id, "rating": r.rating, "title": r.title, "body": r.body, "author": (r.user.profile.full_name.split()[0] if r.user.profile else "Customer"),
                       "created_at": r.created_at.isoformat()} for r in rows]}


@router.post("/products/{slug}/reviews", status_code=201)
def add_review(slug: str, body: ReviewIn, user: User = Depends(get_user), db: Session = Depends(get_db)):
    p = _get_public_product(db, slug)
    bought = db.scalar(select(func.count()).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id)
                       .where(Order.user_id == user.id, OrderItem.product_id == p.id,
                              Order.status.in_(["paid", "processing", "shipped", "delivered"])))
    if not bought:
        raise HTTPException(403, "Only customers who bought this bike can review it.")
    db.add(Review(product_id=p.id, user_id=user.id, rating=body.rating, title=body.title, body=body.body.strip()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You already reviewed this bike.")
    return {"ok": True, "message": "Thank you! Your review will appear after approval."}


# ---------------- extras ----------------
from fastapi import Request, Response  # noqa: E402
from sqlalchemy.exc import IntegrityError as _IE  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.deps import client_ip  # noqa: E402
from app.core.security import limiter  # noqa: E402
from app.models import NewsletterSubscriber  # noqa: E402
from app.schemas.api import NewsletterIn  # noqa: E402


@router.get("/reviews/featured")
def featured_reviews(db: Session = Depends(get_db)):
    """Genuine, approved reviews only. The homepage hides the section when this list is empty."""
    rows = db.execute(select(Review, Product.name, Product.slug).join(Product, Product.id == Review.product_id)
                      .where(Review.is_approved.is_(True), Product.is_published.is_(True), Product.is_archived.is_(False))
                      .order_by(Review.rating.desc(), Review.created_at.desc()).limit(6)).unique().all()
    return [{"rating": r.rating, "title": r.title, "body": r.body, "created_at": r.created_at.isoformat(),
             "author": r.user.profile.full_name.split()[0] if r.user.profile else "Customer", "product_name": name, "product_slug": slug}
            for r, name, slug in rows]


@router.post("/newsletter")
def newsletter(body: NewsletterIn, request: Request, db: Session = Depends(get_db)):
    if not limiter.allow(f"newsletter:{client_ip(request)}", 5, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")
    db.add(NewsletterSubscriber(email=body.email.lower()))
    try:
        db.commit()
    except _IE:
        db.rollback()  # already subscribed: same answer, so nobody can probe who is subscribed
    return {"ok": True, "message": "Thanks for subscribing!"}


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap(db: Session = Depends(get_db)):
    base = settings.site_url.rstrip("/")
    urls = [f"{base}/", f"{base}/shop", f"{base}/about", f"{base}/contact"]
    urls += [f"{base}/shop?category={c['slug']}" for c in categories(db)]
    urls += [f"{base}/product/{p.slug}" for p in db.scalars(_public(select(Product)).order_by(Product.id)).unique().all()]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
          "".join(f"  <url><loc>{u.replace('&', '&amp;')}</loc></url>\n" for u in urls) + "</urlset>\n"
    return Response(xml, media_type="application/xml")


@router.get("/config")
def public_config():
    """Non-secret store settings the website needs (never returns keys or credentials)."""
    return {"currency": settings.currency, "countries": settings.countries, "payment_mode": settings.payment_mode,
            "payment_provider": settings.payment_provider, "tax_rate_percent": settings.tax_rate_percent,
            "shipping": {"standard": settings.shipping_standard_fee, "express": settings.shipping_express_fee, "pickup": 0},
            "max_upload_mb": settings.max_upload_mb}
