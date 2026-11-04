
import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import new_token
from app.models import (
    Cart,
    DiscountCode,
    Inventory,
    InventoryAdjustment,
    Order,
    OrderItem,
    Payment,
    Product,
)
from app.services.cart import is_buyable, primary_image
from app.services.common import audit, log

SHIPPING_METHODS = ("standard", "express", "pickup")


def shipping_fee(method: str) -> int:
    return {
        "standard": settings.shipping_standard_fee,
        "express": settings.shipping_express_fee,
        "pickup": 0,
    }[method]


def compute_totals(subtotal: int, method: str, discount: int) -> dict:
    taxable = max(subtotal - discount, 0)
    tax = int(
        (
            Decimal(taxable)
            * Decimal(str(settings.tax_rate_percent))
            / 100
        ).quantize(Decimal(1), ROUND_HALF_UP)
    )
    shipping = shipping_fee(method)

    return {
        "subtotal_minor": subtotal,
        "discount_minor": discount,
        "shipping_minor": shipping,
        "tax_minor": tax,
        "total_minor": subtotal - discount + shipping + tax,
        "currency": settings.currency,
    }


def find_discount(
    db: Session,
    code: str,
    subtotal: int,
    lock: bool = False,
) -> tuple[DiscountCode, int]:
    q = select(DiscountCode).where(
        func.lower(DiscountCode.code) == code.strip().lower()
    )

    if lock:
        q = q.with_for_update()

    d = db.scalar(q)
    now = datetime.now(timezone.utc)

    if (
        not d
        or not d.is_active
        or (d.expires_at and d.expires_at < now)
        or (d.max_uses is not None and d.used_count >= d.max_uses)
    ):
        raise HTTPException(400, "This discount code is not valid.")

    amount = (
        subtotal * d.percent_off // 100
        if d.percent_off
        else min(d.amount_off_minor or 0, subtotal)
    )

    return d, amount


def _adjust(
    db: Session,
    inv: Inventory,
    delta: int,
    reason: str,
    order: Order | None = None,
    user=None,
):
    inv.quantity += delta

    db.add(
        InventoryAdjustment(
            product_id=inv.product_id,
            delta=delta,
            quantity_after=inv.quantity,
            reason=reason,
            order_id=order.id if order else None,
            user_id=user.id if user else None,
        )
    )


def lock_inventory(db: Session, product_ids: list[int]) -> dict[int, Inventory]:
    """Row-lock inventory in a fixed order to prevent overselling and deadlocks."""
    rows = db.scalars(
        select(Inventory)
        .where(Inventory.product_id.in_(sorted(product_ids)))
        .order_by(Inventory.product_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()

    return {row.product_id: row for row in rows}


def release_stock(db: Session, order: Order, reason: str) -> None:
    """Give reserved stock back, exactly once per order."""
    if order.stock_released:
        return

    ids = [item.product_id for item in order.items if item.product_id]
    invs = lock_inventory(db, ids)

    for item in order.items:
        if item.product_id in invs:
            _adjust(
                db,
                invs[item.product_id],
                item.quantity,
                f"restock: {reason}",
                order,
            )

    if order.discount_code:
        discount = db.scalar(
            select(DiscountCode)
            .where(
                func.lower(DiscountCode.code)
                == order.discount_code.lower()
            )
            .with_for_update()
        )

        if discount and discount.used_count > 0:
            discount.used_count -= 1

    order.stock_released = True


def expire_unpaid(db: Session) -> int:
    """Expire only legacy online-payment orders awaiting payment."""
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=settings.unpaid_order_ttl_minutes
    )

    orders = db.scalars(
        select(Order)
        .where(
            Order.status == "pending_payment",
            Order.created_at < cutoff,
        )
        .with_for_update(skip_locked=True)
    ).all()

    for order in orders:
        order.status = "cancelled"
        order.payment_status = "failed"

        for payment in order.payments:
            if payment.status == "pending":
                payment.status = "failed"
                payment.failure_reason = "expired"

        release_stock(db, order, "unpaid order expired")
        audit(db, None, "order.expired", "order", order.number)

    db.commit()
    return len(orders)


def _new_number() -> str:
    return (
        "EB-"
        + datetime.now(timezone.utc).strftime("%y%m%d")
        + "-"
        + "".join(
            secrets.choice(string.ascii_uppercase + string.digits)
            for _ in range(6)
        )
    )


def build_quote(
    db: Session,
    cart: Cart | None,
    method: str,
    code: str | None,
) -> dict:
    from app.services.cart import cart_view

    view = cart_view(db, cart)
    discount = 0
    applied = None

    if code and view["subtotal_minor"] > 0:
        d, discount = find_discount(db, code, view["subtotal_minor"])
        applied = d.code

    return {
        **compute_totals(view["subtotal_minor"], method, discount),
        "discount_code": applied,
        "checkout_ready": view["checkout_ready"],
        "items": view["items"],
    }


def create_order(
    db: Session,
    user,
    cart: Cart | None,
    data,
    idem_key: str,
) -> tuple[Order, bool]:
    """Create a manual-confirmation order in one database transaction."""
    existing = db.scalar(
        select(Order).where(Order.idempotency_key == idem_key)
    )

    if existing:
        if existing.email.lower() != data.email.lower():
            raise HTTPException(
                409,
                "This checkout request key was already used.",
            )
        return existing, False

    if data.country not in settings.countries:
        raise HTTPException(
            400,
            f"We currently deliver only to: {', '.join(settings.countries)}.",
        )

    if not cart or not cart.items:
        raise HTTPException(400, "Your cart is empty.")

    # Keep expiration for older online-payment orders.
    # New manual-confirmation orders are not expired automatically.
    expire_unpaid(db)

    try:
        products = {
            product.id: product
            for product in db.scalars(
                select(Product).where(
                    Product.id.in_(
                        [item.product_id for item in cart.items]
                    )
                )
            )
        }

        invs = lock_inventory(db, list(products))

        order = Order(
            status="pending_confirmation",
            payment_status="unpaid",
            number=_new_number(),
            public_token=new_token(24),
            user_id=user.id if user else None,
            email=data.email.lower(),
            customer_name=data.full_name,
            phone=data.phone,
            ship_line1=data.line1,
            ship_line2=data.line2,
            ship_city=data.city,
            ship_region=data.region,
            ship_country=data.country,
            ship_postal_code=data.postal_code,
            shipping_method=data.shipping_method,
            currency=settings.currency,
            idempotency_key=idem_key,
            subtotal_minor=0,
            total_minor=0,
        )

        db.add(order)
        db.flush()

        subtotal = 0

        for cart_item in cart.items:
            product = products.get(cart_item.product_id)
            inventory = invs.get(cart_item.product_id)

            if (
                product is None
                or inventory is None
                or not is_buyable(product)
            ):
                raise HTTPException(
                    409,
                    "A bike in your cart is no longer available. "
                    "Please review your cart.",
                )

            if inventory.quantity < cart_item.quantity:
                raise HTTPException(
                    409,
                    f"Sorry, only {inventory.quantity} left of "
                    f"{product.name}. Please update your cart.",
                )

            _adjust(
                db,
                inventory,
                -cart_item.quantity,
                "order placed",
                order,
            )

            line_total = product.price_minor * cart_item.quantity
            subtotal += line_total

            order.items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    image_url=primary_image(product),
                    unit_price_minor=product.price_minor,
                    quantity=cart_item.quantity,
                    line_total_minor=line_total,
                )
            )

        discount_amount = 0

        if data.discount_code:
            discount_record, discount_amount = find_discount(
                db,
                data.discount_code,
                subtotal,
                lock=True,
            )
            discount_record.used_count += 1
            order.discount_code = discount_record.code

        totals = compute_totals(
            subtotal,
            data.shipping_method,
            discount_amount,
        )

        if totals["total_minor"] <= 0:
            raise HTTPException(
                400,
                "Orders with a zero total are not supported.",
            )

        order.subtotal_minor = totals["subtotal_minor"]
        order.discount_minor = totals["discount_minor"]
        order.shipping_minor = totals["shipping_minor"]
        order.tax_minor = totals["tax_minor"]
        order.total_minor = totals["total_minor"]

        # No Payment record is created: payment will be arranged manually.
        db.delete(cart)

        audit(
            db,
            user,
            "order.created",
            "order",
            order.number,
            {"total": order.total_minor},
        )

        db.commit()
        db.refresh(order)

    except IntegrityError:
        db.rollback()

        again = db.scalar(
            select(Order).where(Order.idempotency_key == idem_key)
        )

        if again:
            return again, False

        log.exception("Order creation failed")

        raise HTTPException(
            409,
            "Could not place the order. Please review your cart and try again.",
        )

    except HTTPException:
        db.rollback()
        raise

    return order, True
