"""DEVELOPMENT DEMO DATA ONLY. Creates sample categories and bikes (no images, no users, no passwords).
Run:  python -m app.seed        It refuses to run when APP_ENV=production."""
import sys

from sqlalchemy import select

from app.core import db as dbmod
from app.core.config import settings
from app.models import Category, Inventory, Product, ProductSpec
from app.services.common import slugify

CATS = [("Mountain", "Trail-ready e-MTBs with powerful motors and suspension."), ("Commuter", "Comfortable city bikes for daily rides."),
        ("Folding", "Compact e-bikes for small spaces and mixed transport."), ("Fat-tire", "Go-anywhere bikes for sand, gravel and rough roads."),
        ("Road", "Light, fast electric road bikes."), ("Cargo", "Carry kids, groceries and goods with ease.")]

# (name, category, price USD, original, sku, stock, motor W, battery Wh, range km, speed, charge h, frame, wheel, kg, brakes, suspension, colors)
BIKES = [
    ("Volt Trail X1", "Mountain", 1450000, 1650000, "DEMO-MTB-001", 8, 750, 720, 90, 32, 5.0, "Aluminium 6061", '29"', 24.5, "Hydraulic disc", "Front 120mm", ["Charcoal", "Electric Green"]),
    ("Volt Trail X2 Pro", "Mountain", 1890000, None, "DEMO-MTB-002", 3, 1000, 960, 110, 45, 6.0, "Carbon fibre", '29"', 22.0, "Hydraulic disc 4-piston", "Full 140mm", ["Black"]),
    ("Metro Glide", "Commuter", 790000, 890000, "DEMO-COM-001", 15, 350, 468, 70, 25, 4.5, "Aluminium", '28"', 21.0, "Hydraulic disc", "None", ["White", "Charcoal"]),
    ("Metro Glide Step-Through", "Commuter", 820000, None, "DEMO-COM-002", 10, 350, 468, 70, 25, 4.5, "Aluminium", '28"', 21.5, "Hydraulic disc", "None", ["White", "Green"]),
    ("Pocket Zip 20", "Folding", 640000, None, "DEMO-FLD-001", 12, 250, 360, 50, 25, 4.0, "Aluminium", '20"', 17.8, "Mechanical disc", "None", ["Charcoal"]),
    ("Dune Rider 4.0", "Fat-tire", 1090000, 1190000, "DEMO-FAT-001", 6, 750, 624, 80, 32, 5.5, "Aluminium", '26" x 4.0', 28.0, "Hydraulic disc", "Front 100mm", ["Black", "Electric Green"]),
    ("Apex Road E", "Road", 1590000, None, "DEMO-RD-001", 4, 250, 250, 100, 25, 3.0, "Carbon fibre", '700c', 12.9, "Hydraulic disc", "None", ["White"]),
    ("Haul Pro Cargo", "Cargo", 1750000, None, "DEMO-CRG-001", 2, 750, 1000, 100, 25, 6.5, "Reinforced steel", '24"', 36.0, "Hydraulic disc", "None", ["Charcoal", "Green"]),
]


def run() -> None:
    if settings.is_production:
        sys.exit("Refusing to seed demo data in production.")
    dbmod.init_engine(settings.database_url)
    with dbmod.SessionLocal() as db:
        cats = {}
        for i, (name, desc) in enumerate(CATS):
            c = db.scalar(select(Category).where(Category.name == name)) or Category(name=name, slug=slugify(name), description=desc, sort_order=i)
            db.add(c)
            cats[name] = c
        db.flush()
        for n, (name, cat, price, orig, sku, stock, mw, wh, rng, spd, chg, frame, wheel, kg, brakes, susp, colors) in enumerate(BIKES):
            if db.scalar(select(Product).where(Product.sku == sku)):
                continue
            p = Product(name=name, slug=slugify(name), sku=sku, price_minor=price, original_price_minor=orig, category_id=cats[cat].id,
                        description=f"{name}: a demo bike from the seed script. Replace it with your real products in the admin dashboard.",
                        is_published=True, is_featured=n < 4)
            p.inventory = Inventory(quantity=stock, low_stock_threshold=3)
            p.specs = ProductSpec(motor_power_w=mw, battery_wh=wh, range_km=rng, max_speed_kmh=spd, charge_hours=chg, frame_material=frame,
                                  wheel_size=wheel, weight_kg=kg, brakes=brakes, suspension=susp, colors=colors, warranty="2 years frame, 1 year motor and battery")
            db.add(p)
        db.commit()
        print(f"Seeded demo catalogue: {len(CATS)} categories, {len(BIKES)} bikes (no images). Delete them in the admin dashboard when ready.")


if __name__ == "__main__":
    run()
