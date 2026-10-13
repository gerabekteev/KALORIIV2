import re
import json
import logging
from typing import Optional, Dict, Any, Tuple
import httpx
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.scanned_product import UserScannedProduct
from app.schemas.barcode import BarcodeProductResult

logger = logging.getLogger("kalorii.barcode_service")

OPEN_FOOD_FACTS_API_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OFF_HEADERS = {
    "User-Agent": "KaloriiAI-NutritionTracker/1.3 (https://kalorii.lopni.fun; support@kalorii.lopni.fun)"
}


def parse_and_normalize_barcode(raw_input: str) -> Tuple[str, bool]:
    """
    Normalizes a barcode string from either standard barcodes (EAN-13, EAN-8, UPC)
    or Russian 'Chestny ZNAK' (DataMatrix / GS1 format).

    Returns:
        (canonical_code, is_honest_sign)
    """
    clean = raw_input.strip()

    # Clean brackets if provided in human-readable GS1 like '(01)04601234567890(21)...'
    if "(01)" in clean:
        match = re.search(r"\(01\)(\d{14})", clean)
        if match:
            gtin = match.group(1)
            ean = gtin[1:] if gtin.startswith("0") else gtin
            return ean, True

    # Chestny ZNAK / GS1 DataMatrix string starting with 01
    # Format: '01' + 14 digits GTIN + '21' + serial...
    if clean.startswith("01") and len(clean) >= 16:
        gtin_candidate = clean[2:16]
        if gtin_candidate.isdigit():
            ean = gtin_candidate[1:] if gtin_candidate.startswith("0") else gtin_candidate
            return ean, True

    # Clean non-alphanumeric except spaces
    digits_only = re.sub(r"\D", "", clean)

    # 14 digits GTIN
    if len(digits_only) == 14:
        ean = digits_only[1:] if digits_only.startswith("0") else digits_only
        return ean, True

    # Standard EAN-13, UPC (12), EAN-8
    if len(digits_only) in (8, 12, 13):
        return digits_only, False

    # Fallback to digits if any
    return digits_only if digits_only else clean, False


def parse_weight_grams_from_text(qty_str: Optional[str]) -> float:
    """Parses packaging quantity string into weight in grams."""
    if not qty_str:
        return 100.0

    qty_lower = qty_str.lower().strip()
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(г|g|кг|kg|мл|ml|л|l)?", qty_lower)
    if not match:
        return 100.0

    val_str = match.group(1).replace(",", ".")
    unit = match.group(2) or "g"
    try:
        val = float(val_str)
        if unit in ("кг", "kg", "л", "l"):
            return round(val * 1000.0, 1)
        return round(val, 1)
    except ValueError:
        return 100.0


async def fetch_from_open_food_facts(barcode: str) -> Optional[Dict[str, Any]]:
    """Fetches product details from Open Food Facts API."""
    url = OPEN_FOOD_FACTS_API_URL.format(barcode=barcode)
    try:
        async with httpx.AsyncClient(timeout=5.5) as client:
            resp = await client.get(url, headers=OFF_HEADERS)
            if resp.status_code != 200:
                logger.info(f"Open Food Facts returned status {resp.status_code} for {barcode}")
                return None

            data = resp.json()
            if data.get("status") != 1:
                return None

            product = data.get("product")
            if not product:
                return None

            name = (
                product.get("product_name_ru")
                or product.get("product_name")
                or product.get("generic_name_ru")
                or product.get("generic_name")
                or "Продукт по штрихкоду"
            )

            brand = product.get("brands") or product.get("brand_owner") or None
            if brand:
                brand = brand.split(",")[0].strip()

            nutriments = product.get("nutriments", {})

            # Calories extraction
            calories = (
                nutriments.get("energy-kcal_100g")
                or nutriments.get("energy-kcal_value")
                or nutriments.get("energy-kcal")
            )
            if calories is None and "energy_100g" in nutriments:
                calories = float(nutriments["energy_100g"]) / 4.184
            calories = float(calories) if calories is not None else 0.0

            proteins = float(
                nutriments.get("proteins_100g")
                or nutriments.get("proteins_value")
                or 0.0
            )
            fat = float(
                nutriments.get("fat_100g")
                or nutriments.get("fat_value")
                or 0.0
            )
            carbs = float(
                nutriments.get("carbohydrates_100g")
                or nutriments.get("carbohydrates_value")
                or 0.0
            )

            image_url = (
                product.get("image_front_url")
                or product.get("image_front_small_url")
                or product.get("image_url")
                or None
            )

            quantity_raw = product.get("product_quantity") or product.get("quantity") or product.get("serving_quantity")
            package_grams = parse_weight_grams_from_text(str(quantity_raw) if quantity_raw else None)

            return {
                "name": name.strip(),
                "brand": brand,
                "barcode": barcode,
                "calories_per_100g": round(calories, 1),
                "protein_per_100g": round(proteins, 1),
                "fat_per_100g": round(fat, 1),
                "carbs_per_100g": round(carbs, 1),
                "package_weight_grams": package_grams,
                "image_url": image_url,
                "category": product.get("compared_to_category") or "Продукты",
            }

    except Exception as e:
        logger.warning(f"Error fetching from Open Food Facts for {barcode}: {e}")
        return None


async def lookup_barcode_product(
    db: AsyncSession,
    user_id: int,
    raw_code: str,
) -> Optional[BarcodeProductResult]:
    """
    Looks up a product by barcode or Chestny ZNAK code.
    Checks:
    1. Local database (Product.barcode)
    2. Open Food Facts API (with auto-caching to Product)
    Records or updates in user_scanned_products.
    """
    clean_code, is_honest_sign = parse_and_normalize_barcode(raw_code)
    if not clean_code:
        return None

    # 1. Search local DB
    stmt = select(Product).where(
        Product.barcode.in_([clean_code, raw_code.strip()])
    ).limit(1)
    res = await db.execute(stmt)
    existing_product = res.scalar_one_or_none()

    if existing_product:
        # Record in user scanned history
        await record_user_scan(db, user_id, existing_product.id, clean_code)
        return BarcodeProductResult(
            product_id=existing_product.id,
            name=existing_product.name,
            brand=existing_product.brand,
            barcode=clean_code,
            calories_per_100g=existing_product.calories_per_100g,
            protein_per_100g=existing_product.protein_per_100g,
            fat_per_100g=existing_product.fat_per_100g,
            carbs_per_100g=existing_product.carbs_per_100g,
            package_weight_grams=existing_product.package_weight_grams or 100.0,
            image_url=existing_product.image_url,
            source="local",
            is_honest_sign=is_honest_sign,
        )

    # 2. Search Open Food Facts
    off_data = await fetch_from_open_food_facts(clean_code)
    if not off_data and len(clean_code) == 13:
        # Try leading zero if 13 digits
        off_data = await fetch_from_open_food_facts("0" + clean_code)

    if off_data:
        # Cache product into local database
        new_product = Product(
            name=off_data["name"],
            brand=off_data["brand"],
            barcode=clean_code,
            calories_per_100g=off_data["calories_per_100g"],
            protein_per_100g=off_data["protein_per_100g"],
            fat_per_100g=off_data["fat_per_100g"],
            carbs_per_100g=off_data["carbs_per_100g"],
            package_weight_grams=off_data["package_weight_grams"],
            image_url=off_data["image_url"],
            category=off_data.get("category", "Штрихкод"),
            is_custom=False,
        )
        db.add(new_product)
        await db.commit()
        await db.refresh(new_product)

        # Record in user scanned history
        await record_user_scan(db, user_id, new_product.id, clean_code)

        return BarcodeProductResult(
            product_id=new_product.id,
            name=new_product.name,
            brand=new_product.brand,
            barcode=clean_code,
            calories_per_100g=new_product.calories_per_100g,
            protein_per_100g=new_product.protein_per_100g,
            fat_per_100g=new_product.fat_per_100g,
            carbs_per_100g=new_product.carbs_per_100g,
            package_weight_grams=new_product.package_weight_grams or 100.0,
            image_url=new_product.image_url,
            source="openfoodfacts",
            is_honest_sign=is_honest_sign,
        )

    return None


async def record_user_scan(
    db: AsyncSession,
    user_id: int,
    product_id: int,
    barcode: str,
) -> None:
    """Upserts a record into user_scanned_products."""
    try:
        stmt = select(UserScannedProduct).where(
            and_(
                UserScannedProduct.user_id == user_id,
                UserScannedProduct.product_id == product_id,
            )
        )
        res = await db.execute(stmt)
        record = res.scalar_one_or_none()

        if record:
            record.scan_count += 1
            record.last_scanned_at = func.now()
            if barcode and not record.barcode:
                record.barcode = barcode
        else:
            record = UserScannedProduct(
                user_id=user_id,
                product_id=product_id,
                barcode=barcode,
                scan_count=1,
            )
            db.add(record)

        await db.commit()
    except Exception as e:
        logger.warning(f"Error recording user scan: {e}")
        await db.rollback()
