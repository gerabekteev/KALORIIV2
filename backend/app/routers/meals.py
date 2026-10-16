import json
from pathlib import Path
from datetime import date as dt_date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.meal import Meal
from app.models.product import Product
from app.schemas.meal import (
    MealCreate,
    MealUpdate,
    MealCopyRequest,
    MealRecalculateRequest,
    MealResponse,
    DailyMealsSummary,
)
from app.services.auth import get_current_user
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.routers.ai import check_ai_rate_limit, _parse_custom_ai_models, resolve_ai_config

router = APIRouter(prefix="/meals", tags=["Приёмы пищи"])


@router.get("", response_model=DailyMealsSummary)
async def get_meals_by_date(
    date: Optional[dt_date] = Query(None, description="Дата в формате YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all meals for a specific date, including daily nutrition summary."""
    target_date = date or dt_date.today()

    query = (
        select(Meal)
        .where(and_(Meal.user_id == current_user.id, Meal.meal_date == target_date))
        .order_by(Meal.meal_time.asc())
    )
    result = await db.execute(query)
    meals = list(result.scalars().all())

    # Compute daily totals
    total_calories = round(sum(m.calories for m in meals), 1)
    total_protein = round(sum(m.protein for m in meals), 1)
    total_fat = round(sum(m.fat for m in meals), 1)
    total_carbs = round(sum(m.carbs for m in meals), 1)

    return DailyMealsSummary(
        date=target_date,
        total_calories=total_calories,
        total_protein=total_protein,
        total_fat=total_fat,
        total_carbs=total_carbs,
        target_calories=current_user.daily_calories_goal,
        goal_calories=current_user.daily_calories_goal,
        target_protein=current_user.daily_protein_goal,
        goal_protein=current_user.daily_protein_goal,
        target_fat=current_user.daily_fat_goal,
        goal_fat=current_user.daily_fat_goal,
        target_carbs=current_user.daily_carbs_goal,
        goal_carbs=current_user.daily_carbs_goal,
        meals=[MealResponse.model_validate(m) for m in meals],
    )


@router.post("", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
async def create_meal(
    meal_in: MealCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new meal record."""
    now = datetime.now()
    meal_date = meal_in.meal_date or now.date()
    meal_time = meal_in.meal_time or now.time().replace(microsecond=0)

    ingredients_json = (
        json.dumps([i.model_dump() for i in meal_in.ingredients], ensure_ascii=False)
        if meal_in.ingredients
        else None
    )

    meal = Meal(
        user_id=current_user.id,
        name=meal_in.name,
        calories=round(meal_in.calories, 1),
        protein=round(meal_in.protein, 1),
        fat=round(meal_in.fat, 1),
        carbs=round(meal_in.carbs, 1),
        weight_grams=round(meal_in.weight_grams or 0.0, 1),
        photo_path=meal_in.photo_path,
        user_comment=meal_in.user_comment,
        ingredients_json=ingredients_json,
        ai_raw_response=meal_in.ai_raw_response,
        is_manually_edited=meal_in.is_manually_edited,
        meal_date=meal_date,
        meal_time=meal_time,
    )
    try:
        db.add(meal)
        await db.commit()
        await db.refresh(meal)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании приёма пищи: {e}",
        )

    return MealResponse.model_validate(meal)


@router.get("/{meal_id}", response_model=MealResponse)
async def get_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific meal by ID."""
    result = await db.execute(
        select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == current_user.id))
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Приём пищи не найден",
        )
    return MealResponse.model_validate(meal)


@router.put("/{meal_id}", response_model=MealResponse)
async def update_meal(
    meal_id: int,
    meal_in: MealUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing meal record."""
    result = await db.execute(
        select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == current_user.id))
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Приём пищи не найден",
        )

    update_data = meal_in.model_dump(exclude_unset=True)
    nullable_fields = {"user_comment", "photo_path"}
    for field, value in update_data.items():
        if field == "ingredients":
            continue
        if value is not None:
            if isinstance(value, float):
                value = round(value, 1)
            setattr(meal, field, value)
        elif field in nullable_fields:
            setattr(meal, field, None)

    if meal_in.ingredients is not None:
        meal.ingredients_json = (
            json.dumps([i.model_dump() for i in meal_in.ingredients], ensure_ascii=False)
            if meal_in.ingredients
            else None
        )

    # Flag as manually edited if user changed values
    meal.is_manually_edited = True

    try:
        await db.commit()
        await db.refresh(meal)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении приёма пищи: {e}",
        )

    return MealResponse.model_validate(meal)


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a meal record."""
    result = await db.execute(
        select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == current_user.id))
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Приём пищи не найден",
        )

    file_to_unlink = None
    if meal.photo_path and meal.photo_path.startswith("/uploads/"):
        safe_name = Path(meal.photo_path).name
        upload_root = settings.UPLOAD_DIR.resolve()
        photo_file = (upload_root / safe_name).resolve()
        if photo_file.parent == upload_root and photo_file.is_file():
            other_meals = await db.execute(
                select(Meal.id).where(and_(Meal.id != meal.id, Meal.photo_path == meal.photo_path)).limit(1)
            )
            linked_products = await db.execute(
                select(Product.id).where(Product.image_url == meal.photo_path).limit(1)
            )
            if not other_meals.scalar_one_or_none() and not linked_products.scalar_one_or_none():
                file_to_unlink = photo_file

    try:
        await db.delete(meal)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении приёма пищи: {e}",
        )

    if file_to_unlink:
        try:
            file_to_unlink.unlink()
        except Exception:
            pass

    return None


@router.post("/{meal_id}/recalculate", response_model=MealResponse)
async def recalculate_meal(
    meal_id: int,
    recalculate_in: MealRecalculateRequest = Body(default_factory=MealRecalculateRequest),
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Recalculate meal nutrition and ingredients using AI based on updated user comment.
    - If user_comment is provided, updates the meal's user_comment
    - If the meal has an associated photo on disk, re-analyzes using image AI recognition
    - If no photo exists, re-analyzes using text AI recognition
    - Updates meal name, calories, protein, fat, carbs, weight_grams, is_manually_edited, and ai_raw_response
    """
    # 1. Fetch meal belonging to current user
    result = await db.execute(
        select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == current_user.id))
    )
    meal = result.scalar_one_or_none()
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Приём пищи не найден",
        )

    # 2. Enforce AI rate limit
    check_ai_rate_limit(current_user.id)

    # 3. Update user_comment if new comment provided
    if recalculate_in and recalculate_in.user_comment is not None:
        meal.user_comment = recalculate_in.user_comment.strip() or None

    # 4. Resolve AI configuration (headers take precedence over user saved settings)
    custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
        current_user=current_user,
        x_gemini_key=x_gemini_key,
        x_openrouter_key=x_openrouter_key,
        x_ai_models=x_ai_models,
    )

    # 5. Check if meal has a stored photo
    photo_bytes = None
    if meal.photo_path and not meal.photo_path.startswith(("http://", "https://")):
        filename = meal.photo_path.replace("/uploads/", "").lstrip("/\\")
        photo_file = settings.UPLOAD_DIR / filename
        if photo_file.exists():
            try:
                photo_bytes = photo_file.read_bytes()
            except Exception:
                photo_bytes = None

    # 6. Execute AI recognition (photo or text)
    try:
        if photo_bytes:
            ai_result, prov_used, mod_used = await ai_router.recognize_food(
                image_bytes=photo_bytes,
                mime_type="image/jpeg",
                user_comment=meal.user_comment,
                custom_gemini_key=custom_gemini,
                custom_openrouter_key=custom_openrouter,
                custom_model_chain=custom_chain,
            )
        else:
            # Combine dish name and user comment for accurate AI context
            if meal.user_comment and meal.name and meal.user_comment.strip() != meal.name.strip():
                text_to_analyze = f"{meal.name}. Пояснение: {meal.user_comment.strip()}"
            else:
                text_to_analyze = (meal.user_comment or meal.name or "").strip()

            if not text_to_analyze:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Необходимо указать название или пояснение к блюду для пересчёта",
                )
            ai_result, prov_used, mod_used = await ai_router.recognize_food_by_text(
                text=text_to_analyze,
                custom_gemini_key=custom_gemini,
                custom_openrouter_key=custom_openrouter,
                custom_model_chain=custom_chain,
            )
    except HTTPException:
        raise
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обработке запроса AI: {str(e)}",
        )

    # 7. Update meal fields
    meal.name = ai_result.name
    meal.calories = round(ai_result.calories, 1)
    meal.protein = round(ai_result.protein, 1)
    meal.fat = round(ai_result.fat, 1)
    meal.carbs = round(ai_result.carbs, 1)
    meal.weight_grams = round(ai_result.weight_grams, 1)
    meal.is_manually_edited = False
    meal.ingredients_json = (
        json.dumps([i.model_dump() for i in ai_result.ingredients], ensure_ascii=False)
        if ai_result.ingredients
        else None
    )
    meal.ai_raw_response = json.dumps(
        {
            "provider": prov_used,
            "model": mod_used,
            "confidence": ai_result.confidence,
        },
        ensure_ascii=False,
    )

    try:
        await db.commit()
        await db.refresh(meal)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при сохранении пересчитанного приёма пищи: {e}",
        )

    return MealResponse.model_validate(meal)


@router.post("/{meal_id}/copy", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
async def copy_meal(
    meal_id: int,
    copy_in: Optional[MealCopyRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy an existing meal to the target date/time (default today)."""
    result = await db.execute(
        select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == current_user.id))
    )
    source_meal = result.scalar_one_or_none()
    if not source_meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Приём пищи не найден",
        )

    target_date = (copy_in.target_date if copy_in and copy_in.target_date else None) or dt_date.today()
    target_time = (copy_in.target_time if copy_in and copy_in.target_time else None) or datetime.now().time().replace(microsecond=0)

    new_meal = Meal(
        user_id=current_user.id,
        name=source_meal.name,
        calories=source_meal.calories,
        protein=source_meal.protein,
        fat=source_meal.fat,
        carbs=source_meal.carbs,
        weight_grams=source_meal.weight_grams,
        photo_path=source_meal.photo_path,
        user_comment=source_meal.user_comment,
        ingredients_json=source_meal.ingredients_json,
        ai_raw_response=source_meal.ai_raw_response,
        is_manually_edited=source_meal.is_manually_edited,
        meal_date=target_date,
        meal_time=target_time,
    )
    db.add(new_meal)
    try:
        await db.commit()
        await db.refresh(new_meal)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при копировании приёма пищи: {e}",
        )

    return MealResponse.model_validate(new_meal)
