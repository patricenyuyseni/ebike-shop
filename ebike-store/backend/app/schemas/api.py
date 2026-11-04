import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{7,20}$")


def _clean(v: str | None) -> str | None:
    return v.strip() if isinstance(v, str) else v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def strong(cls, v):
        if not (re.search(r"[A-Za-z]", v) and re.search(r"[0-9]", v)):
            raise ValueError("Password must contain letters and numbers.")
        return v

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if v and not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number.")
        return v.strip() if v else v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if v and not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number.")
        return v.strip() if v else v


class AddressIn(BaseModel):
    label: str | None = Field(default=None, max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = None
    line1: str = Field(min_length=3, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=2, max_length=100)
    region: str = Field(min_length=2, max_length=100)
    country: str = Field(pattern=r"^[A-Za-z]{2}$")
    postal_code: str | None = Field(default=None, max_length=20)

    @field_validator("country")
    @classmethod
    def up(cls, v):
        return v.upper()

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if v and not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number.")
        return v


class CartAddIn(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=10)


class CartSetIn(BaseModel):
    quantity: int = Field(ge=1, le=10)


class QuoteIn(BaseModel):
    shipping_method: Literal["standard", "express", "pickup"] = "standard"
    discount_code: str | None = Field(default=None, max_length=40)


class CheckoutIn(AddressIn):
    # NOTE: there is intentionally NO price / total / quantity-override field. The server computes everything.
    email: EmailStr
    phone: str  # required: needed for delivery and mobile-money payments
    shipping_method: Literal["standard", "express", "pickup"] = "standard"
    discount_code: str | None = Field(default=None, max_length=40)

    @field_validator("phone")
    @classmethod
    def phone_req(cls, v):
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number.")
        return v.strip()


class SimulateIn(BaseModel):
    outcome: Literal["succeeded", "failed"]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=120)
    body: str = Field(min_length=10, max_length=3000)


# ---------- admin ----------
class SpecsIn(BaseModel):
    motor_power_w: int | None = Field(default=None, ge=0, le=5000)
    battery_wh: int | None = Field(default=None, ge=0, le=5000)
    range_km: int | None = Field(default=None, ge=0, le=500)
    max_speed_kmh: int | None = Field(default=None, ge=0, le=100)
    charge_hours: float | None = Field(default=None, ge=0, le=48)
    frame_material: str | None = Field(default=None, max_length=60)
    wheel_size: str | None = Field(default=None, max_length=30)
    weight_kg: float | None = Field(default=None, ge=0, le=100)
    brakes: str | None = Field(default=None, max_length=100)
    suspension: str | None = Field(default=None, max_length=100)
    colors: list[str] = Field(default_factory=list, max_length=12)
    warranty: str | None = Field(default=None, max_length=200)

    @field_validator("colors")
    @classmethod
    def colors_ok(cls, v):
        return [c.strip()[:30] for c in v if c.strip()]


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=10000)
    sku: str = Field(pattern=r"^[A-Za-z0-9._-]{2,60}$")
    price_minor: int = Field(gt=0, le=10_000_000_000)
    original_price_minor: int | None = Field(default=None, gt=0, le=10_000_000_000)
    category_id: int | None = None
    stock_quantity: int = Field(default=0, ge=0, le=100000)
    low_stock_threshold: int = Field(default=3, ge=0, le=1000)
    is_published: bool = False
    is_featured: bool = False
    specs: SpecsIn | None = None

    @model_validator(mode="after")
    def prices(self):
        if self.original_price_minor is not None and self.original_price_minor < self.price_minor:
            raise ValueError("Original price must be higher than or equal to the selling price.")
        return self


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    sort_order: int = Field(default=0, ge=0, le=10000)
    is_published: bool = True


class AdjustIn(BaseModel):
    delta: int = Field(ge=-100000, le=100000)
    reason: str = Field(min_length=3, max_length=200)

    @field_validator("delta")
    @classmethod
    def nonzero(cls, v):
        if v == 0:
            raise ValueError("Adjustment cannot be zero.")
        return v


class ThresholdIn(BaseModel):
    low_stock_threshold: int = Field(ge=0, le=1000)


class OrderStatusIn(BaseModel):
    status: Literal["processing", "shipped", "delivered", "cancelled"]
    carrier: str | None = Field(default=None, max_length=80)
    tracking_number: str | None = Field(default=None, max_length=100)


class TrackingIn(BaseModel):
    carrier: str | None = Field(default=None, max_length=80)
    tracking_number: str = Field(min_length=3, max_length=100)


class ImageOrderIn(BaseModel):
    image_ids: list[int]


class DiscountIn(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{3,40}$")
    percent_off: int | None = Field(default=None, ge=1, le=90)
    amount_off_minor: int | None = Field(default=None, gt=0)
    max_uses: int | None = Field(default=None, gt=0)
    is_active: bool = True

    @model_validator(mode="after")
    def one_kind(self):
        if (self.percent_off is None) == (self.amount_off_minor is None):
            raise ValueError("Provide either percent_off or amount_off_minor (not both).")
        return self


class NewsletterIn(BaseModel):
    email: EmailStr
