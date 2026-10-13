from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.user import User, WeightLog
from app.schemas.user import (
    UserResponse,
    UserUpdate,
    WeightLogCreate,
    WeightLogResponse,
    ProfileCalculateRequest,
    ProfileCalculateResponse,
)
from app.services.auth import get_current_user
from app.services.nutrition import calculate_nutrition_plan

router = APIRouter(prefix="/profile", tags=["Профиль"])


@router.get("", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile and settings."""
    return UserResponse.model_validate(current_user)


@router.put("", response_model=UserResponse)
async def update_profile(
    profile_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile parameters and daily nutrition goals."""
    update_data = profile_in.model_dump(exclude_unset=True)

    weight_changed = "current_weight_kg" in update_data and update_data["current_weight_kg"] is not None

    for field, value in update_data.items():
        if value is not None:
            setattr(current_user, field, value)

    # If current weight was updated, also add/update today's entry in weight_log
    if weight_changed:
        today = date.today()
        existing_log_res = await db.execute(
            select(WeightLog).where(
                and_(
                    WeightLog.user_id == current_user.id,
                    WeightLog.log_date == today,
                )
            )
        )
        existing_log = existing_log_res.scalar_one_or_none()
        if existing_log:
            existing_log.weight_kg = current_user.current_weight_kg
        else:
            new_log = WeightLog(
                user_id=current_user.id,
                weight_kg=current_user.current_weight_kg,
                log_date=today,
            )
            db.add(new_log)

    await db.commit()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.post("/calculate", response_model=ProfileCalculateResponse)
async def calculate_profile_goals(
    calc_in: Optional[ProfileCalculateRequest] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Calculate target daily calories and macronutrients (KBJU)
    using the Mifflin-St Jeor formula and activity coefficients.
    """
    if calc_in:
        height = calc_in.height_cm
        weight = calc_in.weight_kg
        age = calc_in.age
        gender = calc_in.gender
        activity = calc_in.activity_level
        goal = calc_in.goal
    else:
        # Fallback to user profile data
        if not (
            current_user.height_cm
            and current_user.current_weight_kg
            and current_user.age
            and current_user.gender
            and current_user.activity_level
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для расчёта необходимо указать рост, вес, возраст, пол и уровень активности",
            )
        height = current_user.height_cm
        weight = current_user.current_weight_kg
        age = current_user.age
        gender = current_user.gender
        activity = current_user.activity_level
        goal = "maintain"

    result = calculate_nutrition_plan(
        weight_kg=weight,
        height_cm=height,
        age=age,
        gender=gender,
        activity_level=activity,
        goal=goal,
    )

    return ProfileCalculateResponse(
        bmr=result["bmr"],
        tdee=result["tdee"],
        daily_calories_goal=result["daily_calories_goal"],
        daily_protein_goal=result["daily_protein_goal"],
        daily_fat_goal=result["daily_fat_goal"],
        daily_carbs_goal=result["daily_carbs_goal"],
    )


@router.post("/weight", response_model=WeightLogResponse, status_code=status.HTTP_201_CREATED)
async def log_weight(
    weight_in: WeightLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Log weight for a specific date and update user's current weight."""
    target_date = weight_in.log_date or date.today()

    # Check if entry for target date exists
    existing_res = await db.execute(
        select(WeightLog).where(
            and_(
                WeightLog.user_id == current_user.id,
                WeightLog.log_date == target_date,
            )
        )
    )
    existing_log = existing_res.scalar_one_or_none()

    if existing_log:
        existing_log.weight_kg = round(weight_in.weight_kg, 1)
        log_entry = existing_log
    else:
        log_entry = WeightLog(
            user_id=current_user.id,
            weight_kg=round(weight_in.weight_kg, 1),
            log_date=target_date,
        )
        db.add(log_entry)

    # If log is for today or future, update current_weight_kg
    if target_date >= date.today():
        current_user.current_weight_kg = round(weight_in.weight_kg, 1)

    await db.commit()
    await db.refresh(log_entry)

    return WeightLogResponse.model_validate(log_entry)
