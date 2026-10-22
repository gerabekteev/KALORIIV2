from datetime import date
from typing import Optional, List
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
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
from app.utils.timezone import resolve_client_date, get_user_now, is_valid_timezone
from app.utils.security import encrypt_api_key, decrypt_api_key, mask_api_key

logger = logging.getLogger("kalorii.profile")
router = APIRouter(prefix="/profile", tags=["Профиль"])


@router.get("", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile and settings."""
    return UserResponse.model_validate(current_user)


@router.put("", response_model=UserResponse)
async def update_profile(
    profile_in: UserUpdate,
    x_client_date: Optional[date] = Header(None, alias="X-Client-Date"),
    x_client_timezone: Optional[str] = Header(None, alias="X-Client-Timezone"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile parameters and daily nutrition goals with guaranteed rollback."""
    if x_client_timezone and getattr(current_user, "timezone", None) != x_client_timezone:
        if is_valid_timezone(x_client_timezone):
            current_user.timezone = x_client_timezone

    update_data = profile_in.model_dump(exclude_unset=True)

    if "timezone" in update_data and update_data["timezone"]:
        if not is_valid_timezone(update_data["timezone"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Некорректный часовой пояс",
            )

    weight_changed = "current_weight_kg" in update_data and update_data["current_weight_kg"] is not None

    for field, value in update_data.items():
        if value is not None:
            setattr(current_user, field, value)

    # If current weight was updated, also add/update today's entry in weight_log
    if weight_changed:
        current_user.current_weight_kg = round(float(current_user.current_weight_kg), 1)
        today = resolve_client_date(x_client_date=x_client_date, user=current_user, tz_header=x_client_timezone)
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
    x_client_date: Optional[date] = Header(None, alias="X-Client-Date"),
    x_client_timezone: Optional[str] = Header(None, alias="X-Client-Timezone"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Log weight for a specific date and update user's current weight."""
    today = resolve_client_date(x_client_date=x_client_date, user=current_user, tz_header=x_client_timezone)
    target_date = weight_in.log_date or today

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
    if not has_newer or target_date >= today:
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
    limit: int = Query(100, ge=1, le=1000, description="Лимит записей"),
    offset: int = Query(0, ge=0, description="Смещение"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all weight logs for current user with pagination."""
    result = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id)
        .order_by(WeightLog.log_date.asc())
        .offset(offset)
        .limit(limit)
    )
    logs = list(result.scalars().all())
    return [WeightLogResponse.model_validate(log) for log in logs]


@router.delete("/weight/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_weight_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific weight log entry."""
    res = await db.execute(
        select(WeightLog).where(
            and_(WeightLog.id == log_id, WeightLog.user_id == current_user.id)
        )
    )
    entry = res.scalar_one_or_none()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Запись журнала веса не найдена",
        )
    await db.delete(entry)
    await db.flush()

    latest_res = await db.execute(
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id)
        .order_by(WeightLog.log_date.desc(), WeightLog.id.desc())
        .limit(1)
    )
    latest_entry = latest_res.scalar_one_or_none()
    if latest_entry:
        current_user.current_weight_kg = latest_entry.weight_kg

    await db.commit()
    return None


@router.get("/ai-settings", response_model=UserAISettingsResponse)
async def get_ai_settings(
    current_user: User = Depends(get_current_user),
):
    """
    Get current user's AI model preferences, priorities, and custom API keys.
    API keys are masked for security and never returned in plain text.
    """
    if not current_user.ai_settings_json or not current_user.ai_settings_json.strip():
        return UserAISettingsResponse(
            models=[AISettingsModelItem(**item) for item in get_default_model_items()],
            gemini_api_key=None,
            openrouter_api_key=None,
            has_gemini_key=False,
            has_openrouter_key=False,
            gemini_key_masked=None,
            openrouter_key_masked=None,
        )

    try:
        data = json.loads(current_user.ai_settings_json)
        if isinstance(data, dict):
            models_data = data.get("models")
            if not isinstance(models_data, list) or len(models_data) == 0:
                models_items = [AISettingsModelItem(**item) for item in get_default_model_items()]
            else:
                models_items = [AISettingsModelItem(**m) for m in models_data]

            raw_gemini_stored = data.get("gemini_api_key") or data.get("geminiApiKey")
            raw_openrouter_stored = data.get("openrouter_api_key") or data.get("openrouterApiKey")

            decrypted_gemini = decrypt_api_key(raw_gemini_stored)
            decrypted_openrouter = decrypt_api_key(raw_openrouter_stored)

            has_gemini = bool(decrypted_gemini and len(decrypted_gemini) > 5)
            has_openrouter = bool(decrypted_openrouter and len(decrypted_openrouter) > 5)

            masked_gemini = mask_api_key(decrypted_gemini)
            masked_openrouter = mask_api_key(decrypted_openrouter)

            return UserAISettingsResponse(
                models=models_items,
                gemini_api_key=masked_gemini,
                openrouter_api_key=masked_openrouter,
                geminiApiKey=masked_gemini,
                openrouterApiKey=masked_openrouter,
                has_gemini_key=has_gemini,
                has_openrouter_key=has_openrouter,
                gemini_key_masked=masked_gemini,
                openrouter_key_masked=masked_openrouter,
            )
    except Exception as e:
        logger.warning(f"Error parsing user ai_settings_json for user {current_user.id}: {e}")

    return UserAISettingsResponse(
        models=[AISettingsModelItem(**item) for item in get_default_model_items()],
        gemini_api_key=None,
        openrouter_api_key=None,
        has_gemini_key=False,
        has_openrouter_key=False,
        gemini_key_masked=None,
        openrouter_key_masked=None,
    )


@router.put("/ai-settings", response_model=UserAISettingsResponse)
async def update_ai_settings(
    settings_in: UserAISettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update and persist current user's AI model priorities and custom API keys.
    API keys are encrypted symmetrically using Fernet before storing.
    """
    # Load existing stored data to preserve keys if client passed a masked string
    existing_gemini_stored = None
    existing_openrouter_stored = None
    if current_user.ai_settings_json:
        try:
            ex_data = json.loads(current_user.ai_settings_json)
            if isinstance(ex_data, dict):
                existing_gemini_stored = ex_data.get("gemini_api_key") or ex_data.get("geminiApiKey")
                existing_openrouter_stored = ex_data.get("openrouter_api_key") or ex_data.get("openrouterApiKey")
        except Exception:
            pass

    input_gemini = settings_in.gemini_api_key or settings_in.geminiApiKey
    input_openrouter = settings_in.openrouter_api_key or settings_in.openrouterApiKey

    # Determine final encrypted keys to store
    if input_gemini is not None and ("..." in input_gemini or "•••" in input_gemini or "****" in input_gemini):
        final_stored_gemini = existing_gemini_stored
    elif input_gemini:
        clean = _sanitize_api_key(input_gemini)
        final_stored_gemini = encrypt_api_key(clean) if clean else None
    else:
        final_stored_gemini = None

    if input_openrouter is not None and ("..." in input_openrouter or "•••" in input_openrouter or "****" in input_openrouter):
        final_stored_openrouter = existing_openrouter_stored
    elif input_openrouter:
        clean = _sanitize_api_key(input_openrouter)
        final_stored_openrouter = encrypt_api_key(clean) if clean else None
    else:
        final_stored_openrouter = None

    saved_data = {
        "models": [item.model_dump() for item in settings_in.models],
        "gemini_api_key": final_stored_gemini,
        "openrouter_api_key": final_stored_openrouter,
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

    decrypted_gemini = decrypt_api_key(final_stored_gemini)
    decrypted_openrouter = decrypt_api_key(final_stored_openrouter)

    masked_gemini = mask_api_key(decrypted_gemini)
    masked_openrouter = mask_api_key(decrypted_openrouter)

    return UserAISettingsResponse(
        models=settings_in.models,
        gemini_api_key=masked_gemini,
        openrouter_api_key=masked_openrouter,
        geminiApiKey=masked_gemini,
        openrouterApiKey=masked_openrouter,
        has_gemini_key=bool(decrypted_gemini),
        has_openrouter_key=bool(decrypted_openrouter),
        gemini_key_masked=masked_gemini,
        openrouter_key_masked=masked_openrouter,
    )
