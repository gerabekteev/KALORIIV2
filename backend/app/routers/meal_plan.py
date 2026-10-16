import json
import logging
from datetime import date as dt_date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.user import User
from app.models.meal import Meal
from app.models.recipe import Recipe
from app.models.scanned_product import UserScannedProduct
from app.models.product import Product
from app.models.meal_plan import MealPlan
from app.schemas.ai import (
    PlannedMealItem,
    MealPlanGenerateRequest,
    MealPlanSaveRequest,
    MealPlanResponse,
)
from app.services.auth import get_current_user
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.utils.ai_providers.base import build_meal_plan_prompt
from app.utils.timezone import resolve_client_date
from app.routers.ai import check_ai_rate_limit, resolve_ai_config

logger = logging.getLogger("kalorii.meal_plan")
router = APIRouter(prefix="/meal-plan", tags=["Планировщик меню (Что съесть)"])


def _build_plan_response(plan: MealPlan) -> MealPlanResponse:
    meals_items = [PlannedMealItem(**m) for m in plan.meals]
    total_cal = round(sum(m.calories for m in meals_items), 1)
    total_prot = round(sum(m.protein for m in meals_items), 1)
    total_fat = round(sum(m.fat for m in meals_items), 1)
    total_carbs = round(sum(m.carbs for m in meals_items), 1)

    return MealPlanResponse(
        id=plan.id,
        plan_date=plan.plan_date,
        meals_count=plan.meals_count,
        target_calories=plan.target_calories,
        target_protein=plan.target_protein,
        target_fat=plan.target_fat,
        target_carbs=plan.target_carbs,
        user_preferences=plan.user_preferences,
        total_generated_calories=total_cal,
        total_generated_protein=total_prot,
        total_generated_fat=total_fat,
        total_generated_carbs=total_carbs,
        meals=meals_items,
        provider_used=plan.provider_used,
        model_used=plan.model_used,
        updated_at=plan.updated_at,
    )


async def _collect_user_food_hints(db: AsyncSession, user_id: int) -> Optional[str]:
    """Collect up to 15 favorite/frequent items from user's meals, recipes, and scanned products."""
    names: List[str] = []
    try:
        rec_res = await db.execute(
            select(Recipe.name)
            .where(Recipe.user_id == user_id)
            .order_by(Recipe.is_favorite.desc(), Recipe.created_at.desc())
            .limit(6)
        )
        names.extend(r for r in rec_res.scalars().all() if r)

        scan_res = await db.execute(
            select(Product.name)
            .join(UserScannedProduct, UserScannedProduct.product_id == Product.id)
            .where(UserScannedProduct.user_id == user_id)
            .order_by(UserScannedProduct.scan_count.desc())
            .limit(6)
        )
        names.extend(s for s in scan_res.scalars().all() if s)

        meal_res = await db.execute(
            select(Meal.name)
            .where(Meal.user_id == user_id)
            .order_by(Meal.created_at.desc())
            .limit(10)
        )
        for m in meal_res.scalars().all():
            if m and m not in names:
                names.append(m)
    except Exception:
        pass

    unique_names = list(dict.fromkeys(names))[:15]
    return ", ".join(unique_names) if unique_names else None


@router.get("", response_model=Optional[MealPlanResponse])
async def get_meal_plan(
    date: Optional[dt_date] = Query(None, description="Дата плана YYYY-MM-DD"),
    x_client_date: Optional[str] = Header(None, alias="X-Client-Date"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve saved generated meal plan for a specific date (returns null if none exists yet)."""
    target_date = resolve_client_date(date, x_client_date, current_user)
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == target_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()
    if not plan:
        return None
    return _build_plan_response(plan)


@router.post("/generate", response_model=MealPlanResponse)
async def generate_meal_plan_endpoint(
    req: MealPlanGenerateRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate or partially regenerate a daily meal plan using the user's priority AI model cascade.
    Strictly enforces that total calories (locked + newly generated) do not exceed req.target_calories.
    Persists the resulting plan in the database so it survives page reloads.
    """
    check_ai_rate_limit(current_user.id)

    locked = [m for m in req.locked_meals if m.locked][: req.meals_count]
    meals_to_generate = max(0, req.meals_count - len(locked))

    # Если все блюда закреплены, просто сохраняем и возвращаем текущий список
    if meals_to_generate == 0:
        final_meals = locked
        prov_used, mod_used = "local", "locked"
    else:
        locked_cal = sum(m.calories for m in locked)
        locked_prot = sum(m.protein for m in locked)
        locked_fat = sum(m.fat for m in locked)
        locked_carbs = sum(m.carbs for m in locked)

        if locked_cal >= req.target_calories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Калорийность закреплённых блюд ({round(locked_cal)} ккал) уже превышает или равна "
                    f"целевому бюджету ({round(req.target_calories)} ккал). "
                    "Снимите закрепление с части блюд или увеличьте норму калорий."
                ),
            )

        remaining_cal = max(100.0, req.target_calories - locked_cal)
        remaining_prot = max(5.0, req.target_protein - locked_prot)
        remaining_fat = max(5.0, req.target_fat - locked_fat)
        remaining_carbs = max(5.0, req.target_carbs - locked_carbs)

        fav_hints = await _collect_user_food_hints(db, current_user.id)
        locked_names = [m.name for m in locked] if locked else None

        prompt = build_meal_plan_prompt(
            meals_to_generate=meals_to_generate,
            max_calories=remaining_cal,
            target_protein=remaining_prot,
            target_fat=remaining_fat,
            target_carbs=remaining_carbs,
            user_preferences=req.user_preferences,
            locked_meal_names=locked_names,
            favorite_products_hint=fav_hints,
        )

        custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
            current_user=current_user,
            x_gemini_key=x_gemini_key,
            x_openrouter_key=x_openrouter_key,
            x_ai_models=x_ai_models,
        )

        try:
            generated_meals, prov_used, mod_used = await ai_router.generate_meal_plan(
                prompt=prompt,
                expected_count=meals_to_generate,
                max_calories=remaining_cal,
                custom_gemini_key=custom_gemini,
                custom_openrouter_key=custom_openrouter,
                custom_model_chain=custom_chain,
            )
        except AllProvidersFailedError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            )
        except Exception as e:
            logger.error(f"Error generating meal plan: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ошибка при генерации меню через AI",
            )

        final_meals = locked + generated_meals
        # Нумеруем подписи приёмов пищи аккуратно по порядку
        for i, m in enumerate(final_meals):
            if not m.meal_label or m.meal_label.startswith("Приём пищи"):
                m.meal_label = f"Приём пищи {i + 1}"

    # Upsert в таблицу meal_plans
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == req.plan_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()

    meals_dump = [m.model_dump() for m in final_meals]

    if plan:
        plan.meals_count = req.meals_count
        plan.target_calories = round(req.target_calories, 1)
        plan.target_protein = round(req.target_protein, 1)
        plan.target_fat = round(req.target_fat, 1)
        plan.target_carbs = round(req.target_carbs, 1)
        plan.user_preferences = req.user_preferences
        plan.meals = meals_dump
        plan.provider_used = prov_used
        plan.model_used = mod_used
    else:
        plan = MealPlan(
            user_id=current_user.id,
            plan_date=req.plan_date,
            meals_count=req.meals_count,
            target_calories=round(req.target_calories, 1),
            target_protein=round(req.target_protein, 1),
            target_fat=round(req.target_fat, 1),
            target_carbs=round(req.target_carbs, 1),
            user_preferences=req.user_preferences,
            meals_json=json.dumps(meals_dump, ensure_ascii=False),
            provider_used=prov_used,
            model_used=mod_used,
        )
        db.add(plan)

    try:
        await db.commit()
        await db.refresh(plan)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error saving generated meal plan: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить сгенерированное меню",
        )

    return _build_plan_response(plan)


@router.put("/save", response_model=MealPlanResponse)
async def save_meal_plan_state(
    req: MealPlanSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save updated state of a meal plan (e.g. locked flags, added_to_diary flags, or edited targets)."""
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == req.plan_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()

    meals_dump = [m.model_dump() for m in req.meals]

    if plan:
        plan.meals_count = req.meals_count
        plan.target_calories = round(req.target_calories, 1)
        plan.target_protein = round(req.target_protein, 1)
        plan.target_fat = round(req.target_fat, 1)
        plan.target_carbs = round(req.target_carbs, 1)
        plan.user_preferences = req.user_preferences
        plan.meals = meals_dump
    else:
        plan = MealPlan(
            user_id=current_user.id,
            plan_date=req.plan_date,
            meals_count=req.meals_count,
            target_calories=round(req.target_calories, 1),
            target_protein=round(req.target_protein, 1),
            target_fat=round(req.target_fat, 1),
            target_carbs=round(req.target_carbs, 1),
            user_preferences=req.user_preferences,
            meals_json=json.dumps(meals_dump, ensure_ascii=False),
        )
        db.add(plan)

    await db.commit()
    await db.refresh(plan)
    return _build_plan_response(plan)
