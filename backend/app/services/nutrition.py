from typing import Literal, Dict, Any


ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,        # Малоподвижный образ жизни
    "light": 1.375,          # Легкая активность (тренировки 1-3 раза в неделю)
    "moderate": 1.55,        # Умеренная активность (тренировки 3-5 раз в неделю)
    "active": 1.725,         # Высокая активность (тренировки 6-7 раз в неделю)
    "very_active": 1.9,      # Очень высокая активность (тяжелый физический труд / 2 тренировки в день)
}

GOAL_ADJUSTMENTS = {
    "lose_weight": 0.82,     # Дефицит калорий ~18% для комфортного похудения
    "maintain": 1.0,         # Поддержание текущего веса
    "gain_weight": 1.15,     # Профицит калорий 15% для набора массы
}


def calculate_bmr(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: Literal["male", "female"],
) -> float:
    """
    Calculate Basal Metabolic Rate (BMR) using Mifflin-St Jeor formula.
    Men: BMR = 10 * weight + 6.25 * height - 5 * age + 5
    Women: BMR = 10 * weight + 6.25 * height - 5 * age - 161
    """
    base = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age)
    if gender == "male":
        return round(base + 5, 1)
    else:
        return round(base - 161, 1)


def calculate_tdee(
    bmr: float,
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"],
) -> float:
    """Calculate Total Daily Energy Expenditure (TDEE)."""
    multiplier = ACTIVITY_MULTIPLIERS.get(activity_level, 1.2)
    return round(bmr * multiplier, 1)


def calculate_nutrition_plan(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: Literal["male", "female"],
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"],
    goal: Literal["lose_weight", "maintain", "gain_weight"] = "maintain",
) -> Dict[str, Any]:
    """
    Calculate complete daily nutrition plan (calories, protein, fat, carbs)
    based on Mifflin-St Jeor equation and standard macro targets.
    """
    bmr = calculate_bmr(weight_kg, height_cm, age, gender)
    tdee = calculate_tdee(bmr, activity_level)

    # Adjust calories according to goal
    goal_multiplier = GOAL_ADJUSTMENTS.get(goal, 1.0)
    target_calories = max(1200, int(round(tdee * goal_multiplier)))

    # Macro distribution
    # Protein: ~1.8 - 2.0g per kg for fat loss / muscle gain, ~1.6g for maintenance
    if goal == "lose_weight":
        protein_g_per_kg = 2.0
        fat_ratio = 0.25  # 25% of calories from healthy fats
    elif goal == "gain_weight":
        protein_g_per_kg = 1.9
        fat_ratio = 0.25
    else:  # maintain
        protein_g_per_kg = 1.6
        fat_ratio = 0.30

    target_protein = int(round(weight_kg * protein_g_per_kg))
    # Minimum protein safeguard
    target_protein = max(50, target_protein)

    # Fat: 25-30% of total daily calories (1g fat = 9 kcal)
    target_fat = int(round((target_calories * fat_ratio) / 9.0))
    # Minimum fat safeguard (0.7g/kg)
    target_fat = max(int(round(weight_kg * 0.7)), target_fat)

    # Carbs: remainder of calories (1g carb = 4 kcal, 1g protein = 4 kcal)
    calories_from_protein = target_protein * 4
    calories_from_fat = target_fat * 9
    remaining_calories = max(0, target_calories - calories_from_protein - calories_from_fat)
    target_carbs = int(round(remaining_calories / 4.0))

    return {
        "bmr": bmr,
        "tdee": tdee,
        "daily_calories_goal": target_calories,
        "daily_protein_goal": target_protein,
        "daily_fat_goal": target_fat,
        "daily_carbs_goal": target_carbs,
    }
