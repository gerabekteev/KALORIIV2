import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.product import Product
from app.models.scanned_product import UserScannedProduct
from app.schemas.barcode import (
    BarcodeLookupRequest,
    BarcodeProductResult,
    RecentScannedProductItem,
    BarcodeScanImageResponse,
)
from app.services.auth import get_current_user
from app.services.barcode_service import (
    lookup_barcode_product,
    parse_and_normalize_barcode,
    record_user_scan,
)
from app.services.ai_router import ai_router
from app.utils.image import save_uploaded_file, process_image

logger = logging.getLogger("kalorii.barcode_router")
router = APIRouter(prefix="/barcode", tags=["Штрихкоды и Честный Знак"])


@router.post("/lookup", response_model=BarcodeProductResult)
async def lookup_barcode_endpoint(
    payload: BarcodeLookupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Search for a product by barcode (EAN-13, EAN-8, UPC) or Chestny ZNAK DataMatrix.
    Searches local database first, then Open Food Facts API with auto-caching.
    """
    result = await lookup_barcode_product(db, current_user.id, payload.barcode)
    if not result:
        clean_code, is_honest = parse_and_normalize_barcode(payload.barcode)
        msg_type = "кодом 'Честный Знак'" if is_honest else "штрихкодом"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Товар с {msg_type} ({clean_code}) не найден в базе. Вы можете добавить его вручную или сфотографировать этикетку.",
        )
    return result


@router.post("/scan-image", response_model=BarcodeScanImageResponse)
async def scan_barcode_image_endpoint(
    photo: UploadFile = File(..., description="Фотография товара со штрихкодом, Честным Знаком или этикеткой"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a photo or screenshot of a product package or barcode.
    AI extracts product details and barcode, queries database or saves analyzed product.
    """
    dest_path, relative_url_path = await save_uploaded_file(photo)

    with open(dest_path, "rb") as f:
        image_bytes = f.read()

    # Use AI Vision cascade to analyze package label / barcode
    ocr_comment = (
        "Внимательно определи на этой упаковке: 1) Название продукта и бренд. "
        "2) Если виден штрихкод или QR/DataMatrix Честный Знак — прочитай цифры. "
        "3) Таблицу КБЖУ на 100 грамм и массу нетто упаковки в граммах."
    )

    try:
        analysis_result, provider_name, model_name = await ai_router.recognize_food(
            image_bytes=image_bytes,
            mime_type="image/jpeg",
            user_comment=ocr_comment,
        )

        name = analysis_result.name.strip() if analysis_result.name else "Продукт по скану"
        grams = analysis_result.weight_grams or 100.0

        # Create or cache in Product
        new_prod = Product(
            name=name,
            calories_per_100g=round(float(analysis_result.calories or 0), 1),
            protein_per_100g=round(float(analysis_result.protein or 0), 1),
            fat_per_100g=round(float(analysis_result.fat or 0), 1),
            carbs_per_100g=round(float(analysis_result.carbs or 0), 1),
            package_weight_grams=grams,
            image_url=relative_url_path,
            category="Скан",
            is_custom=False,
        )
        db.add(new_prod)
        await db.commit()
        await db.refresh(new_prod)

        await record_user_scan(db, current_user.id, new_prod.id, barcode="")

        product_result = BarcodeProductResult(
            product_id=new_prod.id,
            name=new_prod.name,
            brand=None,
            barcode="",
            calories_per_100g=new_prod.calories_per_100g,
            protein_per_100g=new_prod.protein_per_100g,
            fat_per_100g=new_prod.fat_per_100g,
            carbs_per_100g=new_prod.carbs_per_100g,
            package_weight_grams=grams,
            image_url=relative_url_path,
            source="ai_vision",
            is_honest_sign=False,
        )

        return BarcodeScanImageResponse(
            detected_code=None,
            is_honest_sign=False,
            product=product_result,
            message="Продукт успешно распознан по фотографии упаковки",
        )

    except Exception as e:
        logger.error(f"Error in scan_barcode_image_endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Не удалось распознать товар по фото. Попробуйте навести камеру на штрихкод или ввести данные вручную.",
        )


@router.get("/recent", response_model=List[RecentScannedProductItem])
async def get_recent_scanned_products(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user's recent scanned products with images, nutrition, and portion weights.
    """
    stmt = (
        select(UserScannedProduct, Product)
        .join(Product, UserScannedProduct.product_id == Product.id)
        .where(UserScannedProduct.user_id == current_user.id)
        .order_by(UserScannedProduct.last_scanned_at.desc())
        .limit(20)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items: List[RecentScannedProductItem] = []
    for scan_rec, prod in rows:
        items.append(
            RecentScannedProductItem(
                id=scan_rec.id,
                product_id=prod.id,
                name=prod.name,
                brand=prod.brand,
                barcode=scan_rec.barcode or prod.barcode,
                calories_per_100g=prod.calories_per_100g,
                protein_per_100g=prod.protein_per_100g,
                fat_per_100g=prod.fat_per_100g,
                carbs_per_100g=prod.carbs_per_100g,
                package_weight_grams=prod.package_weight_grams or 100.0,
                image_url=prod.image_url,
                last_scanned_at=scan_rec.last_scanned_at.isoformat() if scan_rec.last_scanned_at else "",
                scan_count=scan_rec.scan_count,
            )
        )

    return items


@router.delete("/recent/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recent_scanned_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a product from user's recent scans shelf."""
    stmt = delete(UserScannedProduct).where(
        and_(
            UserScannedProduct.user_id == current_user.id,
            UserScannedProduct.product_id == product_id,
        )
    )
    await db.execute(stmt)
    await db.commit()
    return None
