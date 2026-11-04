from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import new_token
from app.models import Cart, CartItem, Product

MAX_PER_LINE = 10


def primary_image(product: Product) -> str | None:
    if not product.images:
        return None
    for img in product.images:
        if img.is_primary:
            return img.url
    return product.images[0].url


def is_buyable(p: Product) -> bool:
    return p.is_published and not p.is_archived and (p.category is None or (p.category.is_published and not p.category.is_archived))


def stock_of(p: Product) -> int:
    return p.inventory.quantity if p.inventory else 0


def find_cart(db: Session, user, guest_token: str | None) -> Cart | None:
    if user:
        return db.scalar(select(Cart).where(Cart.user_id == user.id))
    if guest_token:
        return db.scalar(select(Cart).where(Cart.guest_token == guest_token))
    return None


def get_or_create_cart(db: Session, user, guest_token: str | None) -> tuple[Cart, str | None]:
    """Returns (cart, new_guest_token_if_one_was_created)."""
    cart = find_cart(db, user, guest_token)
    if cart:
        return cart, None
    if user:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.flush()
        return cart, None
    token = new_token(24)
    cart = Cart(guest_token=token)
    db.add(cart)
    db.flush()
    return cart, token


def merge_guest_cart(db: Session, user, guest_token: str | None) -> None:
    """When a guest signs in, move their cart items into their account cart."""
    if not guest_token:
        return
    guest = db.scalar(select(Cart).where(Cart.guest_token == guest_token))
    if not guest:
        return
    mine = db.scalar(select(Cart).where(Cart.user_id == user.id))
    if mine is None:
        guest.user_id, guest.guest_token = user.id, None
        db.commit()
        return
    have = {i.product_id: i for i in mine.items}
    for gi in list(guest.items):
        product = db.get(Product, gi.product_id)
        cap = min(MAX_PER_LINE, stock_of(product)) if product else 0
        if gi.product_id in have:
            have[gi.product_id].quantity = min(cap, have[gi.product_id].quantity + gi.quantity) or have[gi.product_id].quantity
        elif cap > 0:
            mine.items.append(CartItem(product_id=gi.product_id, quantity=min(cap, gi.quantity)))
    db.delete(guest)
    db.commit()


def set_quantity(db: Session, cart: Cart, product_id: int, quantity: int, additive: bool) -> None:
    product = db.get(Product, product_id)
    if product is None or not is_buyable(product):
        raise HTTPException(404, "This bike is not available.")
    existing = next((i for i in cart.items if i.product_id == product_id), None)
    new_qty = (existing.quantity if existing and additive else 0) + quantity
    if new_qty > MAX_PER_LINE:
        raise HTTPException(409, f"You can order at most {MAX_PER_LINE} of one bike.")
    if new_qty > stock_of(product):
        raise HTTPException(409, f"Only {stock_of(product)} left in stock for {product.name}.")
    if existing:
        existing.quantity = new_qty
    else:
        cart.items.append(CartItem(product_id=product_id, quantity=new_qty))


def remove_item(db: Session, cart: Cart, product_id: int) -> None:
    for i in list(cart.items):
        if i.product_id == product_id:
            cart.items.remove(i)


def cart_view(db: Session, cart: Cart | None) -> dict:
    items, subtotal, ready = [], 0, True
    for ci in (cart.items if cart else []):
        p = db.get(Product, ci.product_id)
        issue, avail = None, stock_of(p) if p else 0
        if p is None or not is_buyable(p):
            issue, ready = "This bike is no longer available.", False
        elif ci.quantity > avail:
            issue, ready = f"Only {avail} left in stock.", False
        line = (p.price_minor * ci.quantity) if (p and not issue) else 0
        subtotal += line
        items.append({
            "product_id": ci.product_id, "slug": p.slug if p else None, "name": p.name if p else "Unavailable product",
            "image_url": primary_image(p) if p else None, "unit_price_minor": p.price_minor if p else 0,
            "quantity": ci.quantity, "line_total_minor": p.price_minor * ci.quantity if p else 0,
            "available": avail, "issue": issue,
        })
    return {"items": items, "subtotal_minor": subtotal, "item_count": sum(i["quantity"] for i in items),
            "currency": settings.currency, "checkout_ready": bool(items) and ready}
