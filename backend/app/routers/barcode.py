import re
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Response, status
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
    BarcodeProductUpdateRequest,
)
from app.services.auth import get_current_user
from app.services.barcode_service import (
    lookup_barcode_product,
    parse_and_normalize_barcode,
    record_user_scan,
    update_barcode_product,
)
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.routers.ai import check_ai_rate_limit, resolve_ai_config
from app.utils.image import save_uploaded_file

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
    If payload.refresh is True, queries Open Food Facts afresh.
    """
    clean_code, is_honest = parse_and_normalize_barcode(payload.barcode)
    if not clean_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный формат штрихкода или кода маркировки.",
        )

    result = await lookup_barcode_product(
        db, current_user.id, payload.barcode, force_refresh=payload.refresh
    )
    if not result:
        msg_type = "кодом 'Честный Знак'" if is_honest else "штрихкодом"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Товар с {msg_type} ({clean_code}) не найден в базе. Вы можете добавить его вручную или сфотографировать этикетку.",
        )
    return result


@router.put("/product/{product_id}", response_model=BarcodeProductResult)
async def update_barcode_product_endpoint(
    product_id: int,
    payload: BarcodeProductUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update product nutritional values and package weight in database.
    Subsequent scans of this product's barcode will yield the verified data.
    """
    try:
        updated = await update_barcode_product(
            db=db,
            product_id=product_id,
            user_id=current_user.id,
            name=payload.name,
            brand=payload.brand,
            calories_per_100g=payload.calories_per_100g,
            protein_per_100g=payload.protein_per_100g,
            fat_per_100g=payload.fat_per_100g,
            carbs_per_100g=payload.carbs_per_100g,
            package_weight_grams=payload.package_weight_grams,
            image_url=payload.image_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating barcode product {product_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при сохранении обновлённых данных продукта.",
        )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден в базе данных.",
        )
    return updated


@router.post("/scan-image", response_model=BarcodeScanImageResponse)
async def scan_barcode_image_endpoint(
    photo: UploadFile = File(..., description="Фотография товара со штрихкодом, Честным Знаком или этикеткой"),
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a photo or screenshot of a product package or barcode.
    AI extracts product details and barcode, queries database or saves analyzed product.
    Enforces rate limiting, mime-type validation, and cleans up temporary files on errors.
    """
    # 1. Enforce rate limiting
    check_ai_rate_limit(current_user.id)

    # 2. Validate MIME type and safely save image to disk
    dest_path, relative_url_path = await save_uploaded_file(photo)

    try:
        with open(dest_path, "rb") as f:
            image_bytes = f.read()

        # 3. Resolve AI configuration (headers take precedence over user saved settings)
        custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
            current_user=current_user,
            x_gemini_key=x_gemini_key,
            x_openrouter_key=x_openrouter_key,
            x_ai_models=x_ai_models,
        )

        # 4. Use AI Vision cascade to analyze package label / barcode
        ocr_comment = (
            "Внимательно определи на этой упаковке: 1) Название продукта и бренд. "
            "2) Если виден штрихкод или QR/DataMatrix Честный Знак — прочитай цифры. "
            "3) Таблицу КБЖУ СТРОГО на 100 грамм продукта (калории, белки, жиры, углеводы на 100г) "
            "и массу нетто упаковки в граммах в поле weight_grams (по умолчанию 100)."
        )

        analysis_result, provider_name, model_name = await ai_router.recognize_food(
            image_bytes=image_bytes,
            mime_type="image/jpeg",
            user_comment=ocr_comment,
            custom_gemini_key=custom_gemini,
            custom_openrouter_key=custom_openrouter,
            custom_model_chain=custom_chain,
        )

        name = analysis_result.name.strip() if analysis_result.name else "Продукт по скану"
        grams = analysis_result.weight_grams or 100.0

        # Check if AI detected any barcode sequence in name or raw response
        detected_code = None
        is_honest = False
        raw_resp = getattr(analysis_result, "raw_response", "") or ""
        candidates = re.findall(
            r"\b\d{8,14}\b",
            f"{analysis_result.name or ''} {raw_resp}"
        )
        for cand in candidates:
            c_code, c_honest = parse_and_normalize_barcode(cand)
            if c_code:
                detected_code = c_code
                is_honest = c_honest
                break

        # Check if product already exists by detected_code to avoid duplicates
        existing_prod = None
        if detected_code:
            stmt = select(Product).where(Product.barcode == detected_code).limit(1)
            res = await db.execute(stmt)
            existing_prod = res.scalar_one_or_none()

        if existing_prod:
            if not existing_prod.image_url:
                existing_prod.image_url = relative_url_path
            target_prod = existing_prod
            await db.commit()
            await db.refresh(target_prod)
        else:
            # Create product in DB
            new_prod = Product(
                name=name,
                barcode=detected_code,
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
            target_prod = new_prod

        await record_user_scan(db, current_user.id, target_prod.id, barcode=detected_code or "")

        product_result = BarcodeProductResult(
            product_id=target_prod.id,
            name=target_prod.name,
            brand=target_prod.brand,
            barcode=detected_code or "",
            calories_per_100g=target_prod.calories_per_100g,
            protein_per_100g=target_prod.protein_per_100g,
            fat_per_100g=target_prod.fat_per_100g,
            carbs_per_100g=target_prod.carbs_per_100g,
            package_weight_grams=target_prod.package_weight_grams or grams,
            image_url=target_prod.image_url or relative_url_path,
            source="ai_vision",
            is_honest_sign=is_honest,
        )

        return BarcodeScanImageResponse(
            detected_code=detected_code,
            is_honest_sign=is_honest,
            product=product_result,
            message="Продукт успешно распознан по фотографии упаковки",
        )

    except HTTPException:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        await db.rollback()
        raise
    except AllProvidersFailedError as e:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Сервисы распознавания временно недоступны: {str(e)}",
        )
    except Exception as e:
        logger.error(f"Error in scan_barcode_image_endpoint: {e}", exc_info=True)
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        await db.rollback()
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


@router.delete("/recent/{product_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_recent_scanned_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a product from user's recent scans shelf. Returns 204 No Content with user isolation."""
    try:
        stmt = delete(UserScannedProduct).where(
            and_(
                UserScannedProduct.user_id == current_user.id,
                UserScannedProduct.product_id == product_id,
            )
        )
        await db.execute(stmt)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in delete_recent_scanned_product: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при удалении товара из недавних",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
