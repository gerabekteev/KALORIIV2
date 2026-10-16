from datetime import date
from typing import Optional, List
import json
import logging
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
from app.schemas.profile import (
    AISettingsModelItem,
    UserAISettingsResponse,
    UserAISettingsUpdate,
)
from app.services.ai_router import get_default_model_items
from app.services.auth import get_current_user
from app.services.nutrition import calculate_nutrition_plan
from app.routers.ai import _sanitize_api_key

logger = logging.getLogger("kalorii.profile")
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
    """Update profile parameters and daily nutrition goals with guaranteed rollback."""
    update_data = profile_in.model_dump(exclude_unset=True)

    weight_changed = "current_weight_kg" in update_data and update_data["current_weight_kg"] is not None

    for field, value in update_data.items():
        if value is not None:
            setattr(current_user, field, value)

    # If current weight was updated, also add/update today's entry in weight_log
    if weight_changed:
        current_user.current_weight_kg = round(float(current_user.current_weight_kg), 1)
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

    try:
        await db.commit()
        await db.refresh(current_user)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating user profile {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при обновлении профиля",
        )

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
        height = calc_in.height_cm or current_user.height_cm
        weight = calc_in.weight_kg or calc_in.current_weight_kg or current_user.current_weight_kg
        target_weight = calc_in.target_weight_kg or current_user.target_weight_kg
        age = calc_in.age or current_user.age
        gender = calc_in.gender or current_user.gender
        activity = calc_in.activity_level or current_user.activity_level

        # Determine goal
        raw_goal = calc_in.goal or calc_in.goal_type
        if raw_goal in ("lose", "lose_weight"):
            goal = "lose_weight"
        elif raw_goal in ("gain", "gain_weight"):
            goal = "gain_weight"
        elif raw_goal == "maintain":
            goal = "maintain"
        elif target_weight and weight:
            if float(target_weight) < float(weight) - 0.5:
                goal = "lose_weight"
            elif float(target_weight) > float(weight) + 0.5:
                goal = "gain_weight"
            else:
                goal = "maintain"
        else:
            goal = "maintain"
    else:
        # Fallback to user profile data
        height = current_user.height_cm
        weight = current_user.current_weight_kg
        age = current_user.age
        gender = current_user.gender
        activity = current_user.activity_level
        goal = "maintain"

    if not (height and weight and age and gender and activity):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для расчёта необходимо указать рост, вес, возраст, пол и уровень активности",
        )

    result = calculate_nutrition_plan(
        weight_kg=float(weight),
        height_cm=float(height),
        age=int(age),
        gender=gender,  # type: ignore[arg-type]
        activity_level=activity,  # type: ignore[arg-type]
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

    # If target_date is today/future or the most recent entry in weight_log, update current_weight_kg
    newer_res = await db.execute(
        select(WeightLog.id).where(
            and_(
                WeightLog.user_id == current_user.id,
                WeightLog.log_date > target_date,
            )
        ).limit(1)
    )
    has_newer = newer_res.scalar_one_or_none() is not None
    if not has_newer or target_date >= date.today():
        current_user.current_weight_kg = round(weight_in.weight_kg, 1)

    try:
        await db.commit()
        await db.refresh(log_entry)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error logging weight for user {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при сохранении веса",
        )

    return WeightLogResponse.model_validate(log_entry)


@router.get("/weight", response_model=List[WeightLogResponse])
async def get_weight_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all weight logs for current user."""
    result = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id)
        .order_by(WeightLog.log_date.asc())
    )
    logs = list(result.scalars().all())
    return [WeightLogResponse.model_validate(log) for log in logs]


@router.get("/ai-settings", response_model=UserAISettingsResponse)
async def get_ai_settings(
    current_user: User = Depends(get_current_user),
):
    """
    Get current user's AI model preferences, priorities, and custom API keys.
    Falls back to default model chain if no custom settings have been saved.
    """
    if not current_user.ai_settings_json or not current_user.ai_settings_json.strip():
        return UserAISettingsResponse(
            models=[AISettingsModelItem(**item) for item in get_default_model_items()],
            gemini_api_key=None,
            openrouter_api_key=None,
        )

    try:
        data = json.loads(current_user.ai_settings_json)
        if isinstance(data, dict):
            models_data = data.get("models")
            if not isinstance(models_data, list) or len(models_data) == 0:
                models_items = [AISettingsModelItem(**item) for item in get_default_model_items()]
            else:
                models_items = [AISettingsModelItem(**m) for m in models_data]

            raw_gemini = data.get("gemini_api_key") or data.get("geminiApiKey")
            raw_openrouter = data.get("openrouter_api_key") or data.get("openrouterApiKey")
            gemini_clean = _sanitize_api_key(raw_gemini)
            openrouter_clean = _sanitize_api_key(raw_openrouter)

            return UserAISettingsResponse(
                models=models_items,
                gemini_api_key=gemini_clean,
                openrouter_api_key=openrouter_clean,
                geminiApiKey=gemini_clean,
                openrouterApiKey=openrouter_clean,
            )
    except Exception as e:
        logger.warning(f"Error parsing user ai_settings_json for user {current_user.id}: {e}")

    return UserAISettingsResponse(
        models=[AISettingsModelItem(**item) for item in get_default_model_items()],
        gemini_api_key=None,
        openrouter_api_key=None,
    )


@router.put("/ai-settings", response_model=UserAISettingsResponse)
async def update_ai_settings(
    settings_in: UserAISettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update and persist current user's AI model priorities and custom API keys.
    Sanitizes keys, validates formats, and guarantees rollback on failure.
    """
    raw_gemini = settings_in.gemini_api_key or settings_in.geminiApiKey
    raw_openrouter = settings_in.openrouter_api_key or settings_in.openrouterApiKey
    clean_gemini = _sanitize_api_key(raw_gemini)
    clean_openrouter = _sanitize_api_key(raw_openrouter)

    saved_data = {
        "models": [item.model_dump() for item in settings_in.models],
        "gemini_api_key": clean_gemini,
        "openrouter_api_key": clean_openrouter,
    }

    current_user.ai_settings_json = json.dumps(saved_data, ensure_ascii=False)

    try:
        await db.commit()
        await db.refresh(current_user)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating AI settings for user {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при сохранении настроек AI",
        )

    return UserAISettingsResponse(
        models=settings_in.models,
        gemini_api_key=clean_gemini,
        openrouter_api_key=clean_openrouter,
        geminiApiKey=clean_gemini,
        openrouterApiKey=clean_openrouter,
    )
