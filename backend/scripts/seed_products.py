import asyncio
import json
import logging
import sys
from pathlib import Path

# Add backend directory to sys.path for direct CLI script execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import AsyncSessionLocal
from app.models.product import Product

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kalorii.seed")

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "products_seed.json"


async def seed_products(session: AsyncSession) -> int:
    """Seed or update products from products_seed.json idempotently."""
    if not SEED_FILE.exists():
        logger.warning(f"Seed file not found at {SEED_FILE}")
        return 0

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        products_data = json.load(f)

    # Get set of all existing standard product names
    existing_res = await session.execute(
        select(Product.name).where(Product.is_custom == False)
    )
    existing_names = set(existing_res.scalars().all())

    inserted = 0
    for item in products_data:
        name = item["name"]
        if name in existing_names:
            continue

        product = Product(
            name=name,
            calories_per_100g=float(item["calories_per_100g"]),
            protein_per_100g=float(item["protein_per_100g"]),
            fat_per_100g=float(item["fat_per_100g"]),
            carbs_per_100g=float(item["carbs_per_100g"]),
            category=item.get("category"),
            is_custom=False,
            created_by_user_id=None,
        )
        session.add(product)
        existing_names.add(name)
        inserted += 1

    if inserted > 0:
        await session.commit()
        logger.info(f"Successfully added {inserted} new products from seed into the database.")
    else:
        logger.info(f"All {len(products_data)} seed products are already up to date in the database.")

    return inserted


async def main():
    async with AsyncSessionLocal() as session:
        await seed_products(session)


if __name__ == "__main__":
    asyncio.run(main())
