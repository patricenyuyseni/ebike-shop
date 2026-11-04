"""Payment providers + trusted server-side event processing.

An order becomes 'paid' ONLY inside apply_event(), which runs only after a provider's
signed webhook was verified. Reaching a success page never changes payment state."""
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Order, Payment, WebhookEvent
from app.services.common import audit, log
from app.services.orders import release_stock

TOLERANCE_SECONDS = 300


class PaymentNotConfigured(Exception):
    pass


class InvalidSignature(Exception):
    pass


@dataclass
class PaymentEvent:
    event_id: str
    provider_ref: str
    status: str  # "succeeded" | "failed"
    amount_minor: int
    currency: str
    reason: str | None = None


def sign(body: bytes, timestamp: str) -> str:
    return hmac.new(settings.webhook_secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


class TestProvider:
    """Built-in simulated provider for TEST MODE. No money moves."""
    name = "test"

    def create_payment(self, order: Order, payment: Payment) -> dict:
        ref = f"test_{payment.id}_{order.number}"
        return {"provider_ref": ref,
                "checkout_url": f"{settings.frontend_origin}/pay/test/{order.number}?token={order.public_token}"}

    def verify_and_parse(self, headers, body: bytes) -> PaymentEvent:
        ts, sig = headers.get("x-timestamp", ""), headers.get("x-signature", "")
        if not ts.isdigit() or abs(time.time() - int(ts)) > TOLERANCE_SECONDS:
            raise InvalidSignature("stale or missing timestamp")
        if not hmac.compare_digest(sign(body, ts), sig):
            raise InvalidSignature("bad signature")
        d = json.loads(body)
        return PaymentEvent(d["event_id"], d["provider_ref"], d["status"], int(d["amount_minor"]), d["currency"], d.get("reason"))


def get_provider(name: str | None = None):
    name = name or settings.payment_provider
    if name == "test":
        if settings.payment_mode != "test":
            raise PaymentNotConfigured("The test payment provider cannot be used in live mode.")
        return TestProvider()
    # Real providers (Flutterwave, CinetPay, Stripe, ...) are added here as adapters with the same two methods.
    raise PaymentNotConfigured(f"Payment provider '{name}' is not configured. See README > Payments.")


def apply_event(db: Session, provider: str, ev: PaymentEvent) -> str:
    """Idempotent. Returns: processed | duplicate | unknown_payment | ignored. Caller commits."""
    try:
        with db.begin_nested():
            db.add(WebhookEvent(provider=provider, event_id=ev.event_id))
            db.flush()
    except IntegrityError:
        return "duplicate"  # this exact event was already handled

    payment = db.scalar(select(Payment).where(Payment.provider == provider, Payment.provider_ref == ev.provider_ref).with_for_update())
    if payment is None:
        log.warning("Webhook for unknown payment ref %s", ev.provider_ref)
        return "unknown_payment"
    order = db.scalar(select(Order).where(Order.id == payment.order_id).with_for_update())

    if payment.status == "succeeded":
        return "ignored"  # already paid, nothing more to do

    if ev.status == "succeeded":
        if ev.amount_minor != payment.amount_minor or ev.currency != payment.currency:
            payment.status = "review"
            payment.failure_reason = "amount or currency mismatch"
            order.status = "needs_review"
            audit(db, None, "payment.mismatch", "order", order.number, {"expected": payment.amount_minor, "got": ev.amount_minor})
            return "processed"
        payment.status = "succeeded"
        order.payment_status = "paid"
        from sqlalchemy.sql import func
        order.paid_at = func.now()
        if order.status == "pending_payment":
            order.status = "paid"
        else:  # e.g. cancelled/expired before the money arrived: a human must decide (refund or re-stock)
            order.status = "needs_review"
            audit(db, None, "payment.late", "order", order.number, {"status_was": order.status})
        audit(db, None, "payment.succeeded", "order", order.number, {"provider": provider, "ref": ev.provider_ref})
        return "processed"

    # failed
    payment.status = "failed"
    payment.failure_reason = (ev.reason or "payment failed")[:200]
    if order.status == "pending_payment":
        order.status = "cancelled"
        order.payment_status = "failed"
        release_stock(db, order, "payment failed")
    audit(db, None, "payment.failed", "order", order.number, {"reason": payment.failure_reason})
    return "processed"
