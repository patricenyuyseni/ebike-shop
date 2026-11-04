from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import (CSRF_COOKIE, GUEST_COOKIE, SESSION_COOKIE, clear_cookie, client_ip, get_user, get_user_optional,
                           new_csrf, set_session)
from app.core.security import hash_password, limiter, verify_password
from app.models import CustomerProfile, Role, User
from app.schemas.api import LoginIn, RegisterIn
from app.services.cart import merge_guest_cart
from app.services.common import audit

router = APIRouter(prefix="/api")


def me_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.profile.full_name if u.profile else None,
            "phone": u.profile.phone if u.profile else None, "role": u.role.name, "permissions": sorted(u.permission_codes)}


@router.get("/auth/csrf")
def csrf(request: Request, response: Response):
    """The frontend calls this once; it must send the returned token in the X-CSRF-Token header on every POST/PUT/PATCH/DELETE."""
    token = request.cookies.get(CSRF_COOKIE) or new_csrf(response)
    return {"csrf_token": token}


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if not limiter.allow(f"register:{client_ip(request)}", 10, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")
    role = db.scalar(select(Role).where(Role.name == "customer"))
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), role_id=role.id)
    user.profile = CustomerProfile(full_name=body.full_name.strip(), phone=body.phone)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    audit(db, user, "user.registered", "user", user.id, request=request)
    db.commit()
    db.refresh(user)
    merge_guest_cart(db, user, request.cookies.get(GUEST_COOKIE))
    if request.cookies.get(GUEST_COOKIE):
        clear_cookie(response, GUEST_COOKIE)
    set_session(response, user.id)
    return me_out(user)


def _check_login(db: Session, request: Request, body: LoginIn) -> User | None:
    ip = client_ip(request)
    if not (limiter.allow(f"login-ip:{ip}", 30, 300) and limiter.allow(f"login:{ip}:{body.email.lower()}", 8, 300)):
        raise HTTPException(429, "Too many sign-in attempts. Please wait a few minutes and try again.")
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else None)  # same work even if user is unknown
    return user if (user and ok and user.is_active) else None


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = _check_login(db, request, body)
    if not user:
        raise HTTPException(401, "Incorrect email or password.")
    merge_guest_cart(db, user, request.cookies.get(GUEST_COOKIE))
    if request.cookies.get(GUEST_COOKIE):
        clear_cookie(response, GUEST_COOKIE)
    set_session(response, user.id)
    return me_out(user)


@router.post("/admin/auth/login")
def admin_login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = _check_login(db, request, body)
    if not user or "dashboard:read" not in user.permission_codes:
        audit(db, user, "admin.login_denied", "user", user.id if user else None, {"email": body.email.lower()[:100]}, request)
        db.commit()
        raise HTTPException(401, "Incorrect email or password, or this account is not an administrator.")
    audit(db, user, "admin.login", "user", user.id, request=request)
    db.commit()
    set_session(response, user.id)
    return me_out(user)


@router.post("/auth/logout")
def logout(response: Response):
    clear_cookie(response, SESSION_COOKIE)
    return {"ok": True}


@router.get("/auth/me")
def me(user: User | None = Depends(get_user_optional)):
    return me_out(user) if user else None
