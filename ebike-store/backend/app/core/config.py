"""All settings come from environment variables (or backend/.env).
No secret is ever written in code."""
import hashlib
from functools import cached_property

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"  # development | production
    database_url: str = ""
    frontend_origin: str = "http://localhost:5173"
    site_url: str = "http://localhost:5173"  # public https address of the shop (used in the sitemap)
    secret_key: str = DEV_SECRET
    frontend_dist: str = ""  # folder with the built website; when set, FastAPI serves it too (single-domain deployment)

    # cookies / sessions
    cookie_secure: bool = False  # MUST be true in production (HTTPS)
    cookie_domain: str | None = None
    access_token_minutes: int = 480

    # store rules (money = integer smallest unit; USD has no decimals)
    currency: str = "USD"
    tax_rate_percent: float = 0.0
    shipping_standard_fee: int = 0
    shipping_express_fee: int = 0
    shipping_countries: str = "CM"
    unpaid_order_ttl_minutes: int = 30

    # Cloudinary (private, backend only)
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    max_upload_mb: int = 5

    # payments
    payment_mode: str = "test"  # test | live
    payment_provider: str = "test"
    payment_webhook_secret: str = ""

    # email (optional)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "orders@example.com"
    admin_notification_email: str = ""

    rate_limit_enabled: bool = True

    @field_validator("database_url")
    @classmethod
    def normalise_db_url(cls, v: str) -> str:
        """Hosting providers hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg driver name."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def countries(self) -> list[str]:
        return [c.strip().upper() for c in self.shipping_countries.split(",") if c.strip()]

    @property
    def cloudinary_configured(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    @cached_property
    def webhook_secret(self) -> str:
        if self.payment_webhook_secret:
            return self.payment_webhook_secret
        # Test mode only: derive from the app secret so no extra setup is needed.
        return hashlib.sha256(("webhook:" + self.secret_key).encode()).hexdigest()

    def validate_for_production(self) -> None:
        problems = []
        if self.secret_key == DEV_SECRET or len(self.secret_key) < 32:
            problems.append("SECRET_KEY must be a random string of 32+ characters")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true")
        if self.payment_mode == "live" and not self.payment_webhook_secret:
            problems.append("PAYMENT_WEBHOOK_SECRET is required in live mode")
        if self.payment_mode == "live" and self.payment_provider == "test":
            problems.append("PAYMENT_PROVIDER cannot be 'test' in live mode")
        if not self.database_url:
            problems.append("DATABASE_URL is required")
        if problems:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


settings = Settings()
