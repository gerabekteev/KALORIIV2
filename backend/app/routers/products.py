from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.database import get_db
from app.models.user import User
from app.models.product import Product
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
)
from app.services.auth import get_current_user
from app.utils.image import safe_unlink_upload_if_unreferenced

router = APIRouter(prefix="/products", tags=["Продукты"])


@router.get("", response_model=List[ProductResponse])
async def search_products(
    search: Optional[str] = Query(None, description="Поисковый запрос по названию"),
    category: Optional[str] = Query(None, description="Категория продукта"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search and list products (both global database and user's custom products)."""
    # Base filter: either global products or user's custom products
    conditions = [
        or_(
            Product.is_custom.is_(False),
            Product.created_by_user_id == current_user.id,
        )
    ]

    if search:
        search_pattern = f"%{search.strip().lower()}%"
        from sqlalchemy import func
        conditions.append(func.lower(Product.name).like(search_pattern))

    if category:
        conditions.append(Product.category == category)
    else:
        # Exclude technical 'Рецепты' category products from general search unless explicitly requested
        conditions.append(or_(Product.category.is_(None), Product.category != "Рецепты"))

    query = (
        select(Product)
        .where(and_(*conditions))
        .order_by(Product.is_custom.desc(), Product.name.asc())
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(query)
    products = list(result.scalars().all())
    return [ProductResponse.model_validate(p) for p in products]


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_product(
    product_in: ProductCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a custom product for the current user.
    If a barcode is provided, normalizes it (EAN / Chestny ZNAK), deduplicates against
    the user's existing custom products, and records it in user_scanned_products.
    """
    from app.services.barcode_service import parse_and_normalize_barcode, record_user_scan

    raw_barcode = product_in.barcode.strip() if product_in.barcode else None
    clean_barcode = None
    is_honest = False
    if raw_barcode:
        parsed_code, parsed_honest = parse_and_normalize_barcode(raw_barcode)
        clean_barcode = parsed_code or raw_barcode[:100]
        is_honest = parsed_honest

    product = None
    if clean_barcode:
        existing_res = await db.execute(
            select(Product)
            .where(
                and_(
                    Product.barcode == clean_barcode,
                    Product.is_custom.is_(True),
                    Product.created_by_user_id == current_user.id,
                )
            )
            .limit(1)
        )
        product = existing_res.scalar_one_or_none()

    if product:
        product.name = product_in.name.strip()
        product.calories_per_100g = round(product_in.calories_per_100g, 1)
        product.protein_per_100g = round(product_in.protein_per_100g, 1)
        product.fat_per_100g = round(product_in.fat_per_100g, 1)
        product.carbs_per_100g = round(product_in.carbs_per_100g, 1)
        if product_in.category:
            product.category = product_in.category
        if product_in.brand is not None:
            product.brand = product_in.brand.strip() if product_in.brand else None
        if product_in.image_url is not None:
            product.image_url = product_in.image_url.strip() if product_in.image_url else None
        if product_in.package_weight_grams is not None:
            product.package_weight_grams = max(1.0, round(product_in.package_weight_grams, 1))
    else:
        product = Product(
            name=product_in.name.strip(),
            calories_per_100g=round(product_in.calories_per_100g, 1),
            protein_per_100g=round(product_in.protein_per_100g, 1),
            fat_per_100g=round(product_in.fat_per_100g, 1),
            carbs_per_100g=round(product_in.carbs_per_100g, 1),
            category=product_in.category,
            barcode=clean_barcode,
            brand=product_in.brand.strip() if product_in.brand else None,
            image_url=product_in.image_url.strip() if product_in.image_url else None,
            package_weight_grams=max(1.0, round(product_in.package_weight_grams or 100.0, 1)),
            is_custom=True,
            created_by_user_id=current_user.id,
        )
        db.add(product)

    await db.commit()
    await db.refresh(product)

    if clean_barcode:
        await record_user_scan(
            db,
            user_id=current_user.id,
            product_id=product.id,
            barcode=clean_barcode,
            is_honest_sign=is_honest,
        )

    return ProductResponse.model_validate(product)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get product details by ID."""
    result = await db.execute(
        select(Product).where(
            and_(
                Product.id == product_id,
                or_(
                    Product.is_custom.is_(False),
                    Product.created_by_user_id == current_user.id,
                ),
            )
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден",
        )
    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_custom_product(
    product_id: int,
    product_in: ProductUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom product (only owned by current user)."""
    result = await db.execute(
        select(Product).where(
            and_(
                Product.id == product_id,
                Product.created_by_user_id == current_user.id,
            )
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден или недоступен для редактирования",
        )

    old_image_url = product.image_url
    update_data = product_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None or field in ("brand", "image_url", "barcode", "category"):
            if isinstance(value, float):
                value = round(value, 1)
            setattr(product, field, value)

    await db.commit()
    await db.refresh(product)

    if old_image_url and old_image_url != product.image_url:
        await safe_unlink_upload_if_unreferenced(db, old_image_url, exclude_product_id=product.id)

    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom product (only owned by current user)."""
    result = await db.execute(
        select(Product).where(
            and_(
                Product.id == product_id,
                Product.created_by_user_id == current_user.id,
            )
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Продукт не найден или недоступен для удаления",
        )

    from app.models.recipe import RecipeItem
    recipe_usage = await db.execute(
        select(RecipeItem).where(RecipeItem.product_id == product_id)
    )
    if recipe_usage.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Невозможно удалить продукт, так как он используется в сохранённых рецептах.",
        )

    image_url = product.image_url
    try:
        await db.delete(product)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Невозможно удалить продукт, так как он используется в сохранённых рецептах.",
        )

    if image_url:
        await safe_unlink_upload_if_unreferenced(db, image_url)
    return None
