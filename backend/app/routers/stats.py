from datetime import date, timedelta
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.user import User, WeightLog
from app.models.meal import Meal
from app.schemas.stats import (
    DayStats,
    StatsPeriodResponse,
    MacroDistribution,
    WeightStatsResponse,
    WeightHistoryPoint,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/stats", tags=["Статистика"])


@router.get("", response_model=StatsPeriodResponse)
async def get_stats(
    period: str = Query("week", description="Период: day, week, month, year, custom"),
    start_date: Optional[date] = Query(None, description="Начальная дата для custom"),
    end_date: Optional[date] = Query(None, description="Конечная дата для custom"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated nutrition statistics and daily breakdowns for a given period."""
    today = date.today()

    if period in ("day", "today"):
        start = today
        end = today
    elif period == "week":
        start = today - timedelta(days=6)
        end = today
    elif period == "month":
        start = today - timedelta(days=29)
        end = today
    elif period == "year":
        start = today - timedelta(days=364)
        end = today
    elif period == "custom":
        if not start_date or not end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для произвольного периода необходимо указать start_date и end_date",
            )
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date не может быть позже end_date",
            )
        start = start_date
        end = end_date
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимый период. Допустимые значения: day, today, week, month, year, custom",
        )

    # Fetch all meals in range
    meals_query = (
        select(Meal)
        .where(
            and_(
                Meal.user_id == current_user.id,
                Meal.meal_date >= start,
                Meal.meal_date <= end,
            )
        )
        .order_by(Meal.meal_date.asc())
    )
    result = await db.execute(meals_query)
    meals = list(result.scalars().all())

    # Group meals by date
    meals_by_date: Dict[date, List[Meal]] = {}
    for m in meals:
        meals_by_date.setdefault(m.meal_date, []).append(m)

    # Build day-by-day stats
    daily_stats: List[DayStats] = []
    total_days = (end - start).days + 1
    tracked_days = 0
    goal_met_days = 0

    sum_cal = 0.0
    sum_prot = 0.0
    sum_fat = 0.0
    sum_carb = 0.0

    curr = start
    while curr <= end:
        day_meals = meals_by_date.get(curr, [])
        day_cal = round(sum(m.calories for m in day_meals), 1)
        day_prot = round(sum(m.protein for m in day_meals), 1)
        day_fat = round(sum(m.fat for m in day_meals), 1)
        day_carb = round(sum(m.carbs for m in day_meals), 1)

        # Check goal achievement (within +/- 10% of target or <= target)
        goal_target = current_user.daily_calories_goal
        # A day is achieved if tracked and within 90%-110% of calorie goal
        goal_achieved = (
            day_cal > 0 and (goal_target * 0.85 <= day_cal <= goal_target * 1.15)
        )

        if day_meals:
            tracked_days += 1
            if goal_achieved:
                goal_met_days += 1
            sum_cal += day_cal
            sum_prot += day_prot
            sum_fat += day_fat
            sum_carb += day_carb

        daily_stats.append(
            DayStats(
                date=curr,
                calories=day_cal,
                protein=day_prot,
                fat=day_fat,
                carbs=day_carb,
                meals_count=len(day_meals),
                goal_calories=current_user.daily_calories_goal,
                target_calories=current_user.daily_calories_goal,
                goal_protein=current_user.daily_protein_goal,
                goal_fat=current_user.daily_fat_goal,
                goal_carbs=current_user.daily_carbs_goal,
                goal_achieved=goal_achieved,
            )
        )
        curr += timedelta(days=1)

    # Compute averages across tracked days (or total days if 0 tracked)
    divisor = tracked_days if tracked_days > 0 else 1
    avg_cal = round(sum_cal / divisor, 1)
    avg_prot = round(sum_prot / divisor, 1)
    avg_fat = round(sum_fat / divisor, 1)
    avg_carb = round(sum_carb / divisor, 1)

    # Macro calories
    p_kcal = sum_prot * 4
    f_kcal = sum_fat * 9
    c_kcal = sum_carb * 4
    total_macro_kcal = p_kcal + f_kcal + c_kcal

    if total_macro_kcal > 0:
        p_pct = round((p_kcal / total_macro_kcal) * 100, 1)
        f_pct = round((f_kcal / total_macro_kcal) * 100, 1)
        c_pct = round((c_kcal / total_macro_kcal) * 100, 1)
    else:
        p_pct = f_pct = c_pct = 0.0

    goal_met_percentage = round((goal_met_days / total_days) * 100, 1) if total_days > 0 else 0.0

    return StatsPeriodResponse(
        period=period,
        start_date=start,
        end_date=end,
        total_days=total_days,
        tracked_days=tracked_days,
        days_tracked=tracked_days,
        goal_met_days=goal_met_days,
        goal_met_percentage=goal_met_percentage,
        target_met_percentage=goal_met_percentage,
        total_calories=round(sum_cal, 1),
        average_calories=avg_cal,
        avg_calories=avg_cal,
        average_protein=avg_prot,
        avg_protein=avg_prot,
        average_fat=avg_fat,
        avg_fat=avg_fat,
        average_carbs=avg_carb,
        avg_carbs=avg_carb,
        macro_distribution=MacroDistribution(
            protein_grams=round(sum_prot, 1),
            fat_grams=round(sum_fat, 1),
            carbs_grams=round(sum_carb, 1),
            protein_percent=p_pct,
            fat_percent=f_pct,
            carbs_percent=c_pct,
        ),
        daily_stats=daily_stats,
        days=daily_stats,
    )


@router.get("/weight", response_model=WeightStatsResponse)
async def get_weight_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get weight history and progress statistics."""
    query = (
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id)
        .order_by(WeightLog.log_date.asc())
    )
    result = await db.execute(query)
    logs = list(result.scalars().all())

    history = [
        WeightHistoryPoint(
            id=log.id,
            date=log.log_date,
            log_date=log.log_date,
            weight_kg=log.weight_kg,
        )
        for log in logs
    ]

    start_weight = history[0].weight_kg if history else current_user.current_weight_kg
    curr_weight = history[-1].weight_kg if history else current_user.current_weight_kg
    change = round(curr_weight - start_weight, 1) if (curr_weight and start_weight) else None

    return WeightStatsResponse(
        current_weight=curr_weight,
        target_weight=current_user.target_weight_kg,
        start_weight=start_weight,
        change_kg=change,
        history=history,
    )
