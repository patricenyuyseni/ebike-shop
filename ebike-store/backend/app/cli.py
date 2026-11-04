"""Command-line helpers.
  python -m app.cli create-admin --email you@example.com     (asks for a password; nothing is stored in files)
  python -m app.cli release-expired                          (cron job: frees stock of unpaid, expired orders)
"""
import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.core import db as dbmod
from app.core.config import settings
from app.core.security import hash_password
from app.models import CustomerProfile, Role, User
from app.services.common import ensure_roles


def create_admin(email: str) -> None:
    pw = getpass.getpass("Choose an admin password (min 12 characters): ")
    if len(pw) < 12 or pw != getpass.getpass("Repeat password: "):
        sys.exit("Passwords did not match or are shorter than 12 characters. Nothing was created.")
    with dbmod.SessionLocal() as db:
        ensure_roles(db)
        role = db.scalar(select(Role).where(Role.name == "admin"))
        user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if user:
            user.role_id, user.password_hash = role.id, hash_password(pw)
            print(f"Updated existing user {email} -> administrator with the new password.")
        else:
            user = User(email=email.lower(), password_hash=hash_password(pw), role_id=role.id)
            user.profile = CustomerProfile(full_name="Administrator")
            db.add(user)
            print(f"Created administrator {email}.")
        db.commit()


def main() -> None:
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set. Fill in backend/.env first.")
    dbmod.init_engine(settings.database_url)
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-admin")
    a.add_argument("--email", required=True)
    sub.add_parser("release-expired")
    args = ap.parse_args()
    if args.cmd == "create-admin":
        create_admin(args.email)
    else:
        from app.services.orders import expire_unpaid
        with dbmod.SessionLocal() as db:
            print("Released orders:", expire_unpaid(db))


if __name__ == "__main__":
    main()
