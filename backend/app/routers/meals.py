from datetime import date as dt_date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.meal import Meal
from app.schemas.meal import (
    MealCreate,
    MealUpdate,
    MealResponse,
    DailyMealsSummary,
)
from app.services.auth import get_current_user

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
        ai_raw_response=meal_in.ai_raw_response,
        is_manually_edited=meal_in.is_manually_edited,
        meal_date=meal_date,
        meal_time=meal_time,
    )
    db.add(meal)
    await db.commit()
    await db.refresh(meal)

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
    for field, value in update_data.items():
        if value is not None:
            if isinstance(value, float):
                value = round(value, 1)
            setattr(meal, field, value)

    # Flag as manually edited if user changed values
    meal.is_manually_edited = True

    await db.commit()
    await db.refresh(meal)

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

    # Clean up uploaded photo if exists
    if meal.photo_path and meal.photo_path.startswith("/uploads/"):
        filename = meal.photo_path.replace("/uploads/", "")
        photo_file = settings.UPLOAD_DIR / filename
        if photo_file.exists():
            try:
                photo_file.unlink()
            except Exception:
                pass

    await db.delete(meal)
    await db.commit()
    return None
