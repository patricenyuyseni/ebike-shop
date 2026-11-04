"""Sends email through SMTP if configured. If not configured, nothing is sent and we say so in the log."""
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.services.common import log


def email_configured() -> bool:
    return bool(settings.smtp_host)


def send_email(to: str, subject: str, body: str) -> bool:
    if not email_configured():
        log.info("Email NOT sent (SMTP not configured): to=%s subject=%s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.email_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return True
    except Exception:
        log.exception("Email sending failed (to=%s)", to)
        return False


def money(minor: int) -> str:
    return f"{minor:,} {settings.currency}"


def order_confirmation(order) -> tuple[str, str]:
    lines = "\n".join(f"- {i.product_name} x{i.quantity}: {money(i.line_total_minor)}" for i in order.items)
    body = (f"Hello {order.customer_name},\n\nThank you! We received your payment for order {order.number}.\n\n"
            f"{lines}\n\nTotal: {money(order.total_minor)}\n\nWe will email you when it ships.")
    return f"Order {order.number} confirmed", body


def shipping_update(order) -> tuple[str, str]:
    s = order.shipment
    track = f"\nCarrier: {s.carrier or '-'}\nTracking number: {s.tracking_number or '-'}" if s else ""
    return f"Order {order.number} has shipped", f"Hello {order.customer_name},\n\nYour order {order.number} is on its way.{track}"


def new_order_notification(order) -> tuple[str, str]:
    """Build an email notification for the store owner about a new order."""
    lines = "\n".join(
        f"- {item.product_name} x{item.quantity}: {money(item.line_total_minor)}"
        for item in order.items
    )

    address_parts = [
        order.ship_line1,
        order.ship_line2,
        order.ship_city,
        order.ship_region,
        order.ship_postal_code,
        order.ship_country,
    ]
    address = ", ".join(part for part in address_parts if part)

    body = (
        f"A new order has been placed: {order.number}\n\n"
        f"Customer: {order.customer_name}\n"
        f"Email: {order.email}\n"
        f"Phone: {order.phone}\n"
        f"Delivery address: {address}\n"
        f"Delivery method: {order.shipping_method}\n\n"
        f"Items:\n{lines}\n\n"
        f"Subtotal: {money(order.subtotal_minor)}\n"
        f"Discount: {money(order.discount_minor)}\n"
        f"Shipping: {money(order.shipping_minor)}\n"
        f"Tax: {money(order.tax_minor)}\n"
        f"Order total: {money(order.total_minor)}\n\n"
        f"Payment status: {order.payment_status}\n"
        f"Order status: {order.status}\n\n"
        "Action required: Contact the customer to confirm bike availability, "
        "delivery arrangements, and payment. No online payment was taken "
        "when this order was placed."
    )

    return f"New order received: {order.number}", body
