from app.core.config import settings
from app.models import Order, Product
from app.services.cart import primary_image, stock_of


def stock_status(p: Product) -> str:
    inv = p.inventory
    if not inv or inv.quantity <= 0:
        return "out_of_stock"
    return "low_stock" if inv.quantity <= inv.low_stock_threshold else "in_stock"


def specs_out(p: Product) -> dict | None:
    s = p.specs
    if not s:
        return None
    return {k: getattr(s, k) for k in ("motor_power_w", "battery_wh", "range_km", "max_speed_kmh", "charge_hours",
            "frame_material", "wheel_size", "weight_kg", "brakes", "suspension", "colors", "warranty")}


def product_card(p: Product) -> dict:
    return {
        "id": p.id, "slug": p.slug, "name": p.name, "price_minor": p.price_minor,
        "original_price_minor": p.original_price_minor, "currency": settings.currency,
        "category": {"name": p.category.name, "slug": p.category.slug} if p.category else None,
        "image_url": primary_image(p), "stock_status": stock_status(p),
        "available_quantity": min(stock_of(p), 10), "is_featured": p.is_featured,
        "range_km": p.specs.range_km if p.specs else None, "motor_power_w": p.specs.motor_power_w if p.specs else None,
    }


def images_out(p: Product) -> list[dict]:
    return [{"id": i.id, "url": i.url, "alt_text": i.alt_text or p.name, "is_primary": i.is_primary, "position": i.position} for i in p.images]


def product_detail(p: Product) -> dict:
    return {**product_card(p), "description": p.description, "sku": p.sku, "images": images_out(p), "specs": specs_out(p)}


def admin_product(p: Product) -> dict:
    inv = p.inventory
    return {**product_detail(p), "is_published": p.is_published, "is_archived": p.is_archived, "category_id": p.category_id,
            "stock_quantity": inv.quantity if inv else 0, "low_stock_threshold": inv.low_stock_threshold if inv else 3,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None}


def order_out(o: Order, admin: bool = False) -> dict:
    d = {
        "number": o.number, "status": o.status, "payment_status": o.payment_status, "currency": o.currency,
        "subtotal_minor": o.subtotal_minor, "discount_minor": o.discount_minor, "shipping_minor": o.shipping_minor,
        "tax_minor": o.tax_minor, "total_minor": o.total_minor, "discount_code": o.discount_code,
        "shipping_method": o.shipping_method, "created_at": o.created_at.isoformat(), "paid_at": o.paid_at.isoformat() if o.paid_at else None,
        "items": [{"product_name": i.product_name, "sku": i.sku, "image_url": i.image_url, "unit_price_minor": i.unit_price_minor,
                   "quantity": i.quantity, "line_total_minor": i.line_total_minor} for i in o.items],
        "shipping_address": {"full_name": o.customer_name, "line1": o.ship_line1, "line2": o.ship_line2, "city": o.ship_city,
                             "region": o.ship_region, "country": o.ship_country, "postal_code": o.ship_postal_code},
        "tracking": {"carrier": o.shipment.carrier, "tracking_number": o.shipment.tracking_number} if o.shipment else None,
    }
    if admin:
        d.update({"email": o.email, "phone": o.phone, "customer_name": o.customer_name, "user_id": o.user_id,
                  "payments": [{"provider": p.provider, "status": p.status, "amount_minor": p.amount_minor, "failure_reason": p.failure_reason,
                                "provider_ref": p.provider_ref} for p in o.payments]})
    return d
