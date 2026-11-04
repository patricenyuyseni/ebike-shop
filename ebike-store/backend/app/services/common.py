import logging
import re
import unicodedata

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import client_ip
from app.models import AuditLog, Permission, Role, User

log = logging.getLogger("ebike")

PERMISSIONS = [
    "dashboard:read", "products:write", "categories:write", "inventory:manage",
    "orders:manage", "discounts:manage", "reviews:moderate", "audit:read",
]


def ensure_roles(db: Session) -> None:
    """Create the 'admin' and 'customer' roles (safe to run many times)."""
    existing = {p.code: p for p in db.scalars(select(Permission))}
    for code in PERMISSIONS:
        if code not in existing:
            existing[code] = Permission(code=code)
            db.add(existing[code])
    db.flush()
    roles = {r.name: r for r in db.scalars(select(Role))}
    if "customer" not in roles:
        db.add(Role(name="customer"))
    if "admin" not in roles:
        db.add(Role(name="admin", permissions=list(existing.values())))
    else:
        roles["admin"].permissions = list(existing.values())
    db.commit()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "item"


def unique_slug(db: Session, model, base: str, exclude_id: int | None = None) -> str:
    slug, n = slugify(base)[:150], 1
    while True:
        q = select(model.id).where(model.slug == slug)
        if exclude_id:
            q = q.where(model.id != exclude_id)
        if db.scalar(q) is None:
            return slug
        n += 1
        slug = f"{slugify(base)[:140]}-{n}"


def audit(db: Session, user: User | None, action: str, entity: str | None = None,
          entity_id=None, detail: dict | None = None, request: Request | None = None) -> None:
    """Adds an audit row to the CURRENT transaction (committed together with the change)."""
    db.add(AuditLog(
        actor_user_id=user.id if user else None, action=action, entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None, detail=detail,
        ip=client_ip(request) if request else None,
    ))


def escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
