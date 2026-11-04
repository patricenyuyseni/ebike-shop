
import json
import time

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import (
    GUEST_COOKIE,
    client_ip,
    get_user_optional,
    set_cookie,
)
from app.core.security import limiter
from app.models import Order, Payment, User
from app.schemas.api import (
    CartAddIn,
    CartSetIn,
    CheckoutIn,
    QuoteIn,
    SimulateIn,
)
from app.services import mailer
from app.services.cart import (
    cart_view,
    find_cart,
    get_or_create_cart,
    remove_item,
    set_quantity,
)
from app.services.common import audit, log
from app.services.orders import build_quote, create_order, release_stock
from app.services.payments import (
    InvalidSignature,
    PaymentNotConfigured,
    apply_event,
    get_provider,
    sign,
)
from app.services.serializers import order_out

router = APIRouter(prefix="/api")
GUEST_DAYS = 30


# ---------------- cart ----------------

@router.get("/cart")
def get_cart(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    return cart_view(
        db,
        find_cart(db, user, request.cookies.get(GUEST_COOKIE)),
    )


@router.post("/cart/items")
def add_item(
    body: CartAddIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    cart, token = get_or_create_cart(
        db, user, request.cookies.get(GUEST_COOKIE)
    )
    set_quantity(db, cart, body.product_id, body.quantity, additive=True)
    db.commit()

    if token:
        set_cookie(
            response,
            GUEST_COOKIE,
            token,
            True,
            86400 * GUEST_DAYS,
        )

    return cart_view(db, cart)


@router.patch("/cart/items/{product_id}")
def change_item(
    product_id: int,
    body: CartSetIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    cart = find_cart(db, user, request.cookies.get(GUEST_COOKIE))

    if not cart or not any(
        item.product_id == product_id for item in cart.items
    ):
        raise HTTPException(404, "That bike is not in your cart.")

    set_quantity(db, cart, product_id, body.quantity, additive=False)
    db.commit()
    return cart_view(db, cart)


@router.delete("/cart/items/{product_id}")
def delete_item(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    cart = find_cart(db, user, request.cookies.get(GUEST_COOKIE))

    if cart:
        remove_item(db, cart, product_id)
        db.commit()

    return cart_view(db, cart)


# ---------------- checkout ----------------

@router.post("/checkout/quote")
def quote(
    body: QuoteIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    cart = find_cart(db, user, request.cookies.get(GUEST_COOKIE))
    return build_quote(
        db,
        cart,
        body.shipping_method,
        body.discount_code,
    )


@router.post("/checkout", status_code=201)
def checkout(
    body: CheckoutIn,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
    idempotency_key: str = Header(
        ...,
        min_length=8,
        max_length=80,
        alias="Idempotency-Key",
    ),
):
    """Place an order for manual confirmation and payment."""

    if not limiter.allow(
        f"checkout:{client_ip(request)}",
        30,
        3600,
    ):
        raise HTTPException(
            429,
            "Too many checkout attempts. Please try again later.",
        )

    cart = find_cart(db, user, request.cookies.get(GUEST_COOKIE))

    order, created = create_order(
        db,
        user,
        cart,
        body,
        idempotency_key,
    )

    # Notify the store owner once when a new order is created.
    if created and settings.admin_notification_email:
        subject, message = mailer.new_order_notification(order)

        bg.add_task(
            mailer.send_email,
            settings.admin_notification_email,
            subject,
            message,
        )

    return {
        "order": {
            **order_out(order),
            "access_token": order.public_token,
        },
        "payment": None,
        "replayed": not created,
    }


# ---------------- orders (owner or secret token only) ----------------

def _owned_order(
    db: Session,
    number: str,
    user: User | None,
    token: str | None,
) -> Order:
    order = db.scalar(
        select(Order).where(Order.number == number)
    )

    authorized = order and (
        (user and order.user_id == user.id)
        or (token and token == order.public_token)
    )

    if not authorized:
        raise HTTPException(
            404,
            "Order not found.",
        )

    return order


@router.get("/orders/{number}")
def order_detail(
    number: str,
    token: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    return order_out(_owned_order(db, number, user, token))


@router.post("/orders/{number}/cancel")
def cancel_unpaid(
    number: str,
    token: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    order = db.scalar(
        select(Order)
        .where(Order.number == number)
        .with_for_update()
    )

    if not order or not (
        (user and order.user_id == user.id)
        or (token and token == order.public_token)
    ):
        raise HTTPException(404, "Order not found.")

    # Customers may cancel only while the order awaits confirmation.
    if order.status not in ("pending_confirmation", "pending_payment"):
        raise HTTPException(
            409,
            "This order can no longer be cancelled here. Please contact us.",
        )

    order.status = "cancelled"

    if order.payment_status != "paid":
        order.payment_status = (
            "failed" if order.status == "pending_payment" else "unpaid"
        )

    for payment in order.payments:
        if payment.status == "pending":
            payment.status = "failed"
            payment.failure_reason = "cancelled by customer"

    release_stock(db, order, "cancelled by customer")
    audit(
        db,
        user,
        "order.cancelled_by_customer",
        "order",
        order.number,
    )
    db.commit()

    return order_out(order)


# ---------------- payments ----------------
# Kept for existing/legacy online-payment orders and provider integrations.

def process_event(
    db: Session,
    bg: BackgroundTasks,
    provider_name: str,
    ev,
) -> str:
    result = apply_event(db, provider_name, ev)
    db.commit()

    if result == "processed":
        payment = db.scalar(
            select(Payment).where(
                Payment.provider == provider_name,
                Payment.provider_ref == ev.provider_ref,
            )
        )

        if payment:
            order = db.get(Order, payment.order_id)

            if (
                order
                and order.payment_status == "paid"
                and order.status == "paid"
            ):
                subject, message = mailer.order_confirmation(order)
                bg.add_task(
                    mailer.send_email,
                    order.email,
                    subject,
                    message,
                )

    return result


@router.post("/webhooks/payments/{provider_name}")
async def payment_webhook(
    provider_name: str,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Accept only correctly signed payment-provider webhooks."""

    try:
        provider = get_provider(provider_name)
    except PaymentNotConfigured:
        raise HTTPException(404, "Unknown payment provider.")

    body = await request.body()

    if len(body) > 65536:
        raise HTTPException(413, "Payload too large.")

    try:
        event = provider.verify_and_parse(
            {key.lower(): value for key, value in request.headers.items()},
            body,
        )
    except (
        InvalidSignature,
        KeyError,
        ValueError,
        json.JSONDecodeError,
    ):
        log.warning(
            "Rejected payment webhook (bad signature or payload) from %s",
            client_ip(request),
        )
        raise HTTPException(400, "Invalid webhook.")

    return {
        "result": process_event(
            db,
            bg,
            provider_name,
            event,
        )
    }


@router.post("/payments/test/{number}/simulate")
def simulate_test_payment(
    number: str,
    body: SimulateIn,
    bg: BackgroundTasks,
    token: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_user_optional),
):
    """Test-only payment simulation for legacy online-payment orders."""

    if (
        settings.payment_mode != "test"
        or settings.payment_provider != "test"
    ):
        raise HTTPException(404, "Not found.")

    order = _owned_order(db, number, user, token)

    payment = next(
        (item for item in order.payments if item.status == "pending"),
        None,
    )

    if not payment:
        raise HTTPException(
            409,
            "This order has no pending payment.",
        )

    payload = json.dumps(
        {
            "event_id": f"evt_{payment.provider_ref}_{body.outcome}",
            "provider_ref": payment.provider_ref,
            "status": body.outcome,
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "reason": (
                "test: payment declined"
                if body.outcome == "failed"
                else None
            ),
        }
    ).encode()

    timestamp = str(int(time.time()))
    provider = get_provider("test")

    event = provider.verify_and_parse(
        {
            "x-timestamp": timestamp,
            "x-signature": sign(payload, timestamp),
        },
        payload,
    )

    return {
        "result": process_event(
            db,
            bg,
            "test",
            event,
        ),
        "mode": "test",
    }
