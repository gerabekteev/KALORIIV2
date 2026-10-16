import re
import json
import logging
import urllib.parse
from typing import Optional, Dict, Any, Tuple
import httpx
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status
from app.models.product import Product
from app.models.scanned_product import UserScannedProduct
from app.schemas.barcode import BarcodeProductResult

logger = logging.getLogger("kalorii.barcode_service")

OPEN_FOOD_FACTS_API_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OFF_HEADERS = {
    "User-Agent": "KaloriiAI-NutritionTracker/1.3 (https://kalorii.lopni.fun; support@kalorii.lopni.fun)"
}


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely converts string or numeric values to float, handling commas and whitespace."""
    if val is None:
        return default
    try:
        return float(str(val).replace(",", ".").strip())
    except (ValueError, TypeError):
        return default


def parse_and_normalize_barcode(raw_input: Optional[str]) -> Tuple[str, bool]:
    """
    Normalizes a barcode string from standard barcodes (EAN-13, EAN-8, UPC)
    or Russian 'Chestny ZNAK' (DataMatrix / GS1 format).

    Supports:
    - GS1 symbology prefixes (]d2, ]C1, ]e0)
    - Group separators: \x1d (GS), \x1e, \x1c, <GS>, [GS], <FNC1>, [FNC1]
    - AI brackets: (01)...(21)...
    - Surrounding quotes, spaces, newlines, and null bytes
    - Leading zero handling in GTIN-14 (0 + 13 digits -> 13-digit EAN)
    - Sanitization against SQL injection / non-barcode symbols

    Returns:
        (canonical_code, is_honest_sign)
    """
    if not raw_input:
        return "", False

    # 1. Clean whitespace, newlines, null bytes, and surrounding quotes/backticks
    clean = raw_input.replace("\x00", "").strip()
    clean = clean.strip("\"'`“”«»")

    if not clean:
        return "", False

    # 2. Strip standard ISO/IEC 15424 barcode symbology prefixes (e.g., ]d2 for DataMatrix, ]C1 for GS1-128)
    clean = re.sub(r"^\][a-zA-Z0-9]{2}", "", clean).strip()

    # 3. Replace text representations of GS / FNC1 with standard \x1d
    clean = re.sub(r"(?i)<gs>|\[gs\]|<fnc1>|\[fnc1\]", "\x1d", clean)

    # Strip leading control characters / separators
    clean = clean.lstrip("\x1d\x1e\x1c \t\r\n")

    # 4. Check for human-readable GS1 AI brackets like '(01)04601234567890(21)...'
    bracket_match = re.search(r"\(\s*01\s*\)\s*(\d{14})", clean)
    if bracket_match:
        gtin = bracket_match.group(1)
        ean = gtin[1:] if gtin.startswith("0") else gtin
        return ean, True

    # 5. Check for GS1 DataMatrix starting with AI 01: '01' + 14 digits GTIN
    ai01_match = re.search(r"(?:^|[\x1d\s])01(\d{14})", clean)
    if ai01_match:
        gtin = ai01_match.group(1)
        ean = gtin[1:] if gtin.startswith("0") else gtin
        return ean, True

    # 6. Extract digits only for standard EAN/UPC/GTIN checks
    digits_only = re.sub(r"\D", "", clean)

    # 14 digits GTIN
    if len(digits_only) == 14:
        ean = digits_only[1:] if digits_only.startswith("0") else digits_only
        return ean, True

    # Standard EAN-13 (13 digits), UPC-A (12 digits), EAN-8 (8 digits)
    if len(digits_only) in (8, 12, 13):
        return digits_only, False

    # 7. Check if digits_only contains 01 prefix and 14-digit GTIN inside
    if len(digits_only) > 14 and digits_only.startswith("01") and len(digits_only) >= 16:
        gtin = digits_only[2:16]
        ean = gtin[1:] if gtin.startswith("0") else gtin
        return ean, True

    # 8. Sanitized fallback (alphanumeric for custom/store barcodes, max 100 chars)
    sanitized = re.sub(r"[^a-zA-Z0-9_-]", "", clean)[:100]
    return (digits_only if digits_only else sanitized), False


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
    """
    Fetches product details from Open Food Facts API with resilient error handling:
    timeouts, 5xx upstream errors, network disconnects, and malformed JSON.
    """
    if not barcode or not re.match(r"^[a-zA-Z0-9_-]+$", barcode):
        logger.warning(f"Invalid barcode format for OFF request: {barcode}")
        return None

    quoted_barcode = urllib.parse.quote(barcode.strip())
    url = OPEN_FOOD_FACTS_API_URL.format(barcode=quoted_barcode)
    try:
        async with httpx.AsyncClient(timeout=5.5) as client:
            resp = await client.get(url, headers=OFF_HEADERS)
            if resp.status_code != 200:
                logger.info(f"Open Food Facts returned status {resp.status_code} for {barcode}")
                return None

            try:
                data = resp.json()
            except (json.JSONDecodeError, ValueError) as json_err:
                logger.warning(f"Open Food Facts returned non-JSON response for {barcode}: {json_err}")
                return None

            if not isinstance(data, dict) or data.get("status") != 1:
                return None

            product = data.get("product")
            if not isinstance(product, dict):
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

            nutriments = product.get("nutriments") or {}
            if not isinstance(nutriments, dict):
                nutriments = {}

            # Calories extraction
            raw_cal = (
                nutriments.get("energy-kcal_100g")
                or nutriments.get("energy-kcal_value")
                or nutriments.get("energy-kcal")
            )
            if raw_cal is None and "energy_100g" in nutriments:
                raw_kj = _safe_float(nutriments.get("energy_100g"), 0.0)
                calories = raw_kj / 4.184
            else:
                calories = _safe_float(raw_cal, 0.0)

            calories = max(0.0, calories)
            proteins = max(0.0, _safe_float(nutriments.get("proteins_100g") or nutriments.get("proteins_value"), 0.0))
            fat = max(0.0, _safe_float(nutriments.get("fat_100g") or nutriments.get("fat_value"), 0.0))
            carbs = max(0.0, _safe_float(nutriments.get("carbohydrates_100g") or nutriments.get("carbohydrates_value"), 0.0))

            image_url = (
                product.get("image_front_url")
                or product.get("image_front_small_url")
                or product.get("image_url")
                or None
            )

            quantity_raw = product.get("product_quantity") or product.get("quantity") or product.get("serving_quantity")
            package_grams = parse_weight_grams_from_text(str(quantity_raw) if quantity_raw else None)

            return {
                "name": str(name).strip(),
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

    except httpx.TimeoutException as te:
        logger.warning(f"Timeout contacting Open Food Facts for {barcode}: {te}")
        return None
    except httpx.RequestError as re_err:
        logger.warning(f"Network error contacting Open Food Facts for {barcode}: {re_err}")
        return None
    except Exception as e:
        logger.warning(f"Error fetching from Open Food Facts for {barcode}: {e}", exc_info=True)
        return None


async def lookup_barcode_product(
    db: AsyncSession,
    user_id: int,
    raw_code: str,
    force_refresh: bool = False,
) -> Optional[BarcodeProductResult]:
    """
    Looks up a product by barcode or Chestny ZNAK code.
    Checks:
    1. Local database (Product.barcode) unless force_refresh is True
    2. Open Food Facts API (with auto-caching to Product)
    Records or updates in user_scanned_products.
    Guarantees session rollback on any database errors.
    """
    clean_code, is_honest_sign = parse_and_normalize_barcode(raw_code)
    if not clean_code:
        return None

    safe_raw = (raw_code or "").strip()[:100]
    search_codes = list(set([c for c in [clean_code, safe_raw] if c]))

    existing_product: Optional[Product] = None
    if not force_refresh:
        # 1. Search local DB
        stmt = select(Product).where(Product.barcode.in_(search_codes)).limit(1)
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
        # Try leading zero if 13 digits (EAN-13 -> GTIN-14)
        off_data = await fetch_from_open_food_facts("0" + clean_code)
    elif not off_data and len(clean_code) == 12:
        # Try leading zero for UPC-A -> EAN-13
        off_data = await fetch_from_open_food_facts("0" + clean_code)

    if off_data:
        # Check if already in DB (especially when force_refresh=True)
        stmt = select(Product).where(Product.barcode.in_(search_codes)).limit(1)
        res = await db.execute(stmt)
        target_product = res.scalar_one_or_none()

        if target_product:
            target_product.name = off_data["name"]
            target_product.brand = off_data["brand"]
            target_product.calories_per_100g = off_data["calories_per_100g"]
            target_product.protein_per_100g = off_data["protein_per_100g"]
            target_product.fat_per_100g = off_data["fat_per_100g"]
            target_product.carbs_per_100g = off_data["carbs_per_100g"]
            target_product.package_weight_grams = off_data["package_weight_grams"]
            if off_data.get("image_url"):
                target_product.image_url = off_data["image_url"]
        else:
            target_product = Product(
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
            db.add(target_product)

        try:
            await db.commit()
            await db.refresh(target_product)
        except Exception as e:
            await db.rollback()
            logger.error(f"Error persisting product from Open Food Facts: {e}", exc_info=True)
            raise

        # Record in user scanned history
        await record_user_scan(db, user_id, target_product.id, clean_code)

        return BarcodeProductResult(
            product_id=target_product.id,
            name=target_product.name,
            brand=target_product.brand,
            barcode=clean_code,
            calories_per_100g=target_product.calories_per_100g,
            protein_per_100g=target_product.protein_per_100g,
            fat_per_100g=target_product.fat_per_100g,
            carbs_per_100g=target_product.carbs_per_100g,
            package_weight_grams=target_product.package_weight_grams or 100.0,
            image_url=target_product.image_url,
            source="openfoodfacts",
            is_honest_sign=is_honest_sign,
        )

    # If force_refresh was True but OFF didn't find anything, fall back to existing DB product
    if force_refresh:
        stmt = select(Product).where(Product.barcode.in_(search_codes)).limit(1)
        res = await db.execute(stmt)
        fallback_prod = res.scalar_one_or_none()
        if fallback_prod:
            await record_user_scan(db, user_id, fallback_prod.id, clean_code)
            return BarcodeProductResult(
                product_id=fallback_prod.id,
                name=fallback_prod.name,
                brand=fallback_prod.brand,
                barcode=clean_code,
                calories_per_100g=fallback_prod.calories_per_100g,
                protein_per_100g=fallback_prod.protein_per_100g,
                fat_per_100g=fallback_prod.fat_per_100g,
                carbs_per_100g=fallback_prod.carbs_per_100g,
                package_weight_grams=fallback_prod.package_weight_grams or 100.0,
                image_url=fallback_prod.image_url,
                source="local",
                is_honest_sign=is_honest_sign,
            )

    return None


async def record_user_scan(
    db: AsyncSession,
    user_id: int,
    product_id: int,
    barcode: str,
) -> None:
    """Upserts a record into user_scanned_products with guaranteed rollback on failure."""
    try:
        stmt = select(UserScannedProduct).where(
            and_(
                UserScannedProduct.user_id == user_id,
                UserScannedProduct.product_id == product_id,
            )
        )
        res = await db.execute(stmt)
        record = res.scalar_one_or_none()

        safe_barcode = (barcode or "")[:100]

        if record:
            record.scan_count += 1
            record.last_scanned_at = func.now()
            if safe_barcode and not record.barcode:
                record.barcode = safe_barcode
        else:
            record = UserScannedProduct(
                user_id=user_id,
                product_id=product_id,
                barcode=safe_barcode,
                scan_count=1,
            )
            db.add(record)

        await db.commit()
    except Exception as e:
        logger.warning(f"Error recording user scan: {e}")
        await db.rollback()


async def update_barcode_product(
    db: AsyncSession,
    product_id: int,
    user_id: int,
    name: str,
    calories_per_100g: float,
    protein_per_100g: float,
    fat_per_100g: float,
    carbs_per_100g: float,
    brand: Optional[str] = None,
    package_weight_grams: Optional[float] = None,
    image_url: Optional[str] = None,
) -> Optional[BarcodeProductResult]:
    """
    Updates product data in the local database and refreshes user scanned cache.
    Guarantees subsequent scans or shelf lookups return the user's verified values.
    Includes guaranteed rollback on transaction errors.
    """
    if product_id <= 0:
        return None

    stmt = select(Product).where(Product.id == product_id)
    res = await db.execute(stmt)
    product = res.scalar_one_or_none()
    if not product:
        return None

    if product.is_custom and product.created_by_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для редактирования этого продукта",
        )
    if not product.is_custom and not product.barcode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Запрещено редактировать базовые системные продукты",
        )

    product.name = name.strip()
    if brand is not None:
        product.brand = brand.strip() if brand else None
    product.calories_per_100g = round(float(calories_per_100g), 1)
    product.protein_per_100g = round(float(protein_per_100g), 1)
    product.fat_per_100g = round(float(fat_per_100g), 1)
    product.carbs_per_100g = round(float(carbs_per_100g), 1)
    if package_weight_grams is not None:
        product.package_weight_grams = max(1.0, round(float(package_weight_grams), 1))
    if image_url is not None:
        product.image_url = image_url.strip() if image_url else None

    try:
        await db.commit()
        await db.refresh(product)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating product {product_id}: {e}", exc_info=True)
        raise

    # Ensure scan record exists and is updated
    await record_user_scan(db, user_id, product.id, product.barcode or "")

    _, is_honest = parse_and_normalize_barcode(product.barcode or "")

    return BarcodeProductResult(
        product_id=product.id,
        name=product.name,
        brand=product.brand,
        barcode=product.barcode or "",
        calories_per_100g=product.calories_per_100g,
        protein_per_100g=product.protein_per_100g,
        fat_per_100g=product.fat_per_100g,
        carbs_per_100g=product.carbs_per_100g,
        package_weight_grams=product.package_weight_grams or 100.0,
        image_url=product.image_url,
        source="local",
        is_honest_sign=is_honest,
    )
