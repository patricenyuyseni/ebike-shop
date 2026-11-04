"""Database tables. Money is stored as integers in the smallest currency unit (USD: whole francs)."""
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

NOW = sa.func.now()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW, onupdate=NOW)


# ---------------- roles & users ----------------
role_permissions = sa.Table(
    "role_permissions",
    Base.metadata,
    sa.Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(60), unique=True)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(30), unique=True)
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(254))
    password_hash: Mapped[str] = mapped_column(sa.String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
    role: Mapped[Role] = relationship(lazy="joined")
    profile: Mapped["CustomerProfile | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    __table_args__ = (Index("uq_users_email_lower", sa.func.lower(email), unique=True),)

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for p in self.role.permissions}


class CustomerProfile(Base, TimestampMixin):
    __tablename__ = "customer_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    full_name: Mapped[str] = mapped_column(sa.String(120))
    phone: Mapped[str | None] = mapped_column(sa.String(30))
    user: Mapped[User] = relationship(back_populates="profile")


class Address(Base, TimestampMixin):
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str | None] = mapped_column(sa.String(40))
    full_name: Mapped[str] = mapped_column(sa.String(120))
    phone: Mapped[str | None] = mapped_column(sa.String(30))
    line1: Mapped[str] = mapped_column(sa.String(200))
    line2: Mapped[str | None] = mapped_column(sa.String(200))
    city: Mapped[str] = mapped_column(sa.String(100))
    region: Mapped[str] = mapped_column(sa.String(100))
    country: Mapped[str] = mapped_column(sa.String(2))
    postal_code: Mapped[str | None] = mapped_column(sa.String(20))


# ---------------- catalogue ----------------
class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(80), unique=True)
    slug: Mapped[str] = mapped_column(sa.String(100), unique=True)
    description: Mapped[str | None] = mapped_column(sa.Text)
    image_url: Mapped[str | None] = mapped_column(sa.String(500))
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    is_published: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
    is_archived: Mapped[bool] = mapped_column(default=False, server_default=sa.false())


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(160))
    slug: Mapped[str] = mapped_column(sa.String(180), unique=True)
    description: Mapped[str] = mapped_column(sa.Text, default="")
    sku: Mapped[str] = mapped_column(sa.String(60), unique=True)
    price_minor: Mapped[int] = mapped_column(sa.BigInteger)
    original_price_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), index=True)
    is_published: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    is_featured: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    is_archived: Mapped[bool] = mapped_column(default=False, server_default=sa.false())

    category: Mapped[Category | None] = relationship(lazy="joined")
    images: Mapped[list["ProductImage"]] = relationship(order_by="ProductImage.position", cascade="all, delete-orphan", lazy="selectin")
    specs: Mapped["ProductSpec | None"] = relationship(uselist=False, cascade="all, delete-orphan", lazy="joined")
    inventory: Mapped["Inventory | None"] = relationship(uselist=False, cascade="all, delete-orphan", lazy="joined")

    __table_args__ = (
        CheckConstraint("price_minor > 0", name="ck_products_price_positive"),
        CheckConstraint("original_price_minor IS NULL OR original_price_minor >= price_minor", name="ck_products_original_ge_price"),
        Index("ix_products_listing", "is_published", "is_archived", "created_at"),
        Index("ix_products_price", "price_minor"),
        Index("ix_products_name_lower", sa.func.lower(name)),
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(sa.String(500))
    public_id: Mapped[str] = mapped_column(sa.String(255))
    alt_text: Mapped[str | None] = mapped_column(sa.String(200))
    position: Mapped[int] = mapped_column(default=0)
    is_primary: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    __table_args__ = (
        # at most one primary image per product
        Index("uq_product_primary_image", "product_id", unique=True, postgresql_where=sa.text("is_primary")),
    )


class ProductSpec(Base):
    __tablename__ = "product_specs"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    motor_power_w: Mapped[int | None]
    battery_wh: Mapped[int | None]
    range_km: Mapped[int | None]
    max_speed_kmh: Mapped[int | None]
    charge_hours: Mapped[float | None]
    frame_material: Mapped[str | None] = mapped_column(sa.String(60))
    wheel_size: Mapped[str | None] = mapped_column(sa.String(30))
    weight_kg: Mapped[float | None]
    brakes: Mapped[str | None] = mapped_column(sa.String(100))
    suspension: Mapped[str | None] = mapped_column(sa.String(100))
    colors: Mapped[list[str]] = mapped_column(ARRAY(sa.String(30)), default=list, server_default="{}")
    warranty: Mapped[str | None] = mapped_column(sa.String(200))


class Inventory(Base):
    __tablename__ = "inventory"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    quantity: Mapped[int] = mapped_column(default=0)
    low_stock_threshold: Mapped[int] = mapped_column(default=3, server_default="3")
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_not_negative"),  # database-level oversell guard
        CheckConstraint("low_stock_threshold >= 0", name="ck_inventory_threshold"),
    )


class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    delta: Mapped[int]
    quantity_after: Mapped[int]
    reason: Mapped[str] = mapped_column(sa.String(200))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW)


# ---------------- carts ----------------
class Cart(Base, TimestampMixin):
    __tablename__ = "carts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    guest_token: Mapped[str | None] = mapped_column(sa.String(64), unique=True)
    items: Mapped[list["CartItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="CartItem.id")
    __table_args__ = (CheckConstraint("user_id IS NOT NULL OR guest_token IS NOT NULL", name="ck_cart_owner"),)


class CartItem(Base):
    __tablename__ = "cart_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    quantity: Mapped[int]
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
        CheckConstraint("quantity > 0 AND quantity <= 10", name="ck_cart_qty"),
    )


# ---------------- discounts ----------------
class DiscountCode(Base, TimestampMixin):
    __tablename__ = "discount_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(40), unique=True)
    percent_off: Mapped[int | None]
    amount_off_minor: Mapped[int | None] = mapped_column(sa.BigInteger)
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
    expires_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    max_uses: Mapped[int | None]
    used_count: Mapped[int] = mapped_column(default=0, server_default="0")
    __table_args__ = (
        CheckConstraint(
            "(percent_off IS NOT NULL AND amount_off_minor IS NULL) OR (percent_off IS NULL AND amount_off_minor IS NOT NULL)",
            name="ck_discount_one_kind",
        ),
        CheckConstraint("percent_off IS NULL OR (percent_off BETWEEN 1 AND 100)", name="ck_discount_percent"),
        CheckConstraint("used_count >= 0", name="ck_discount_used"),
    )


# ---------------- orders & payments ----------------
class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(sa.String(30), unique=True)
    public_token: Mapped[str] = mapped_column(sa.String(64), unique=True)  # lets guests view their own order
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    email: Mapped[str] = mapped_column(sa.String(254))
    customer_name: Mapped[str] = mapped_column(sa.String(120))
    phone: Mapped[str | None] = mapped_column(sa.String(30))
    ship_line1: Mapped[str] = mapped_column(sa.String(200))
    ship_line2: Mapped[str | None] = mapped_column(sa.String(200))
    ship_city: Mapped[str] = mapped_column(sa.String(100))
    ship_region: Mapped[str] = mapped_column(sa.String(100))
    ship_country: Mapped[str] = mapped_column(sa.String(2))
    ship_postal_code: Mapped[str | None] = mapped_column(sa.String(20))
    shipping_method: Mapped[str] = mapped_column(sa.String(20))
    status: Mapped[str] = mapped_column(sa.String(20), default="pending_payment", index=True)
    payment_status: Mapped[str] = mapped_column(sa.String(20), default="unpaid")
    currency: Mapped[str] = mapped_column(sa.String(3))
    subtotal_minor: Mapped[int] = mapped_column(sa.BigInteger)
    discount_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    shipping_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    tax_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    total_minor: Mapped[int] = mapped_column(sa.BigInteger)
    discount_code: Mapped[str | None] = mapped_column(sa.String(40))
    idempotency_key: Mapped[str | None] = mapped_column(sa.String(80), unique=True)
    stock_released: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    paid_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="OrderItem.id")
    payments: Mapped[list["Payment"]] = relationship(lazy="selectin", order_by="Payment.id")
    shipment: Mapped["Shipment | None"] = relationship(uselist=False, cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        CheckConstraint("subtotal_minor >= 0 AND discount_minor >= 0 AND shipping_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0", name="ck_order_amounts"),
        CheckConstraint("total_minor = subtotal_minor - discount_minor + shipping_minor + tax_minor", name="ck_order_total_matches"),
        Index("ix_orders_created", "created_at"),
    )


class OrderItem(Base):
    """Snapshot of what was bought: later product edits never change history."""

    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    product_name: Mapped[str] = mapped_column(sa.String(160))
    sku: Mapped[str] = mapped_column(sa.String(60))
    image_url: Mapped[str | None] = mapped_column(sa.String(500))
    unit_price_minor: Mapped[int] = mapped_column(sa.BigInteger)
    quantity: Mapped[int]
    line_total_minor: Mapped[int] = mapped_column(sa.BigInteger)
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_item_qty"),
        CheckConstraint("line_total_minor = unit_price_minor * quantity", name="ck_item_total"),
    )


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(sa.String(30))
    provider_ref: Mapped[str] = mapped_column(sa.String(120), unique=True)
    status: Mapped[str] = mapped_column(sa.String(20), default="pending")  # pending | succeeded | failed | review
    amount_minor: Mapped[int] = mapped_column(sa.BigInteger)
    currency: Mapped[str] = mapped_column(sa.String(3))
    failure_reason: Mapped[str | None] = mapped_column(sa.String(200))
    # Only non-sensitive references are stored. Card data never touches our servers.


class WebhookEvent(Base):
    """One row per provider event id: guarantees each event is processed at most once."""

    __tablename__ = "webhook_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(sa.String(30))
    event_id: Mapped[str] = mapped_column(sa.String(120))
    received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW)
    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_event"),)


class Shipment(Base, TimestampMixin):
    __tablename__ = "shipments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    carrier: Mapped[str | None] = mapped_column(sa.String(80))
    tracking_number: Mapped[str | None] = mapped_column(sa.String(100))
    shipped_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int]
    title: Mapped[str | None] = mapped_column(sa.String(120))
    body: Mapped[str] = mapped_column(sa.Text)
    is_approved: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    user: Mapped[User] = relationship(lazy="joined")
    __table_args__ = (
        UniqueConstraint("product_id", "user_id", name="uq_review_once"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(sa.String(60), index=True)
    entity: Mapped[str | None] = mapped_column(sa.String(40))
    entity_id: Mapped[str | None] = mapped_column(sa.String(40))
    detail: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(sa.String(64))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW, index=True)


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(254))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=NOW)
    __table_args__ = (Index("uq_newsletter_email_lower", sa.func.lower(email), unique=True),)
