from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import decode_access_token, new_token
from app.models import User

SESSION_COOKIE = "eb_session"
CSRF_COOKIE = "eb_csrf"
GUEST_COOKIE = "eb_cart"


def client_ip(request: Request) -> str:
    # Behind a proxy, configure uvicorn --proxy-headers --forwarded-allow-ips so this is the real client IP.
    return request.client.host if request.client else "unknown"


def set_cookie(response: Response, key: str, value: str, httponly: bool, max_age: int | None = None):
    response.set_cookie(
        key, value, httponly=httponly, secure=settings.cookie_secure, samesite="lax",
        domain=settings.cookie_domain, max_age=max_age, path="/",
    )


def set_session(response: Response, user_id: int):
    from app.core.security import create_access_token
    set_cookie(response, SESSION_COOKIE, create_access_token(user_id), True, settings.access_token_minutes * 60)


def clear_cookie(response: Response, key: str):
    response.delete_cookie(key, path="/", domain=settings.cookie_domain)


def new_csrf(response: Response) -> str:
    token = new_token(24)
    set_cookie(response, CSRF_COOKIE, token, False, 60 * 60 * 24 * 7)
    return token


def get_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    uid = decode_access_token(token) if token else None
    if uid is None:
        return None
    user = db.get(User, uid)
    return user if user and user.is_active else None


def get_user(user: User | None = Depends(get_user_optional)) -> User:
    if user is None:
        raise HTTPException(401, "Please sign in to continue.")
    return user


def require_perm(code: str):
    def checker(user: User = Depends(get_user)) -> User:
        if code not in user.permission_codes:
            raise HTTPException(403, "You do not have permission to do this.")
        return user
    return checker
