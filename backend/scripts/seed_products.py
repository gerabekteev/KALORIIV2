import asyncio
import json
import logging
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import AsyncSessionLocal
from app.models.product import Product

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kalorii.seed")

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "products_seed.json"


async def seed_products(session: AsyncSession) -> int:
    """Seed initial products from products_seed.json if products table has 0 products."""
    count_res = await session.execute(select(func.count(Product.id)))
    count = count_res.scalar_one()

    if count > 0:
        logger.info(f"Products table already contains {count} items; skipping seed.")
        return 0

    if not SEED_FILE.exists():
        logger.warning(f"Seed file not found at {SEED_FILE}")
        return 0

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        products_data = json.load(f)

    inserted = 0
    for item in products_data:
        product = Product(
            name=item["name"],
            calories_per_100g=float(item["calories_per_100g"]),
            protein_per_100g=float(item["protein_per_100g"]),
            fat_per_100g=float(item["fat_per_100g"]),
            carbs_per_100g=float(item["carbs_per_100g"]),
            category=item.get("category"),
            is_custom=False,
            created_by_user_id=None,
        )
        session.add(product)
        inserted += 1

    await session.commit()
    logger.info(f"Successfully seeded {inserted} default products into the database.")
    return inserted


async def main():
    async with AsyncSessionLocal() as session:
        await seed_products(session)


if __name__ == "__main__":
    asyncio.run(main())
