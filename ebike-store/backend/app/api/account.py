from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_user
from app.models import Address, CustomerProfile, Order, User
from app.schemas.api import AddressIn, ProfileIn
from app.services.serializers import order_out

router = APIRouter(prefix="/api")


def addr_out(a: Address) -> dict:
    return {c: getattr(a, c) for c in ("id", "label", "full_name", "phone", "line1", "line2", "city", "region", "country", "postal_code")}


@router.put("/account/profile")
def update_profile(body: ProfileIn, user: User = Depends(get_user), db: Session = Depends(get_db)):
    if not user.profile:
        user.profile = CustomerProfile(full_name=body.full_name.strip(), phone=body.phone)
    else:
        user.profile.full_name, user.profile.phone = body.full_name.strip(), body.phone
    db.commit()
    return {"full_name": user.profile.full_name, "phone": user.profile.phone}


@router.get("/account/addresses")
def list_addresses(user: User = Depends(get_user), db: Session = Depends(get_db)):
    return [addr_out(a) for a in db.scalars(select(Address).where(Address.user_id == user.id).order_by(Address.id))]


@router.post("/account/addresses", status_code=201)
def add_address(body: AddressIn, user: User = Depends(get_user), db: Session = Depends(get_db)):
    count = len(db.scalars(select(Address.id).where(Address.user_id == user.id)).all())
    if count >= 10:
        raise HTTPException(400, "You can save up to 10 addresses.")
    a = Address(user_id=user.id, **body.model_dump())
    db.add(a)
    db.commit()
    return addr_out(a)


@router.delete("/account/addresses/{address_id}")
def delete_address(address_id: int, user: User = Depends(get_user), db: Session = Depends(get_db)):
    a = db.scalar(select(Address).where(Address.id == address_id, Address.user_id == user.id))  # only YOUR addresses
    if not a:
        raise HTTPException(404, "Address not found.")
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.get("/orders")
def my_orders(user: User = Depends(get_user), db: Session = Depends(get_db)):
    orders = db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100)).all()
    return [order_out(o) for o in orders]
