import re
from datetime import datetime, date, time
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.schemas.ai import MealIngredientItem


def _validate_safe_photo_path(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    val = v.strip()
    if not val:
        return None
    if val.startswith(("http://", "https://")):
        return val
    clean_name = val.replace("/uploads/", "").replace("uploads/", "").lstrip("/")
    if ".." in clean_name or "/" in clean_name or "\\" in clean_name:
        raise ValueError("Недопустимый путь к файлу изображения")
    if not re.match(r"^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$", clean_name, re.IGNORECASE):
        raise ValueError("Недопустимый формат имени файла изображения")
    return f"/uploads/{clean_name}"


class MealCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    calories: float = Field(..., ge=0, le=50000)
    protein: float = Field(..., ge=0, le=10000)
    fat: float = Field(..., ge=0, le=10000)
    carbs: float = Field(..., ge=0, le=10000)
    weight_grams: Optional[float] = Field(0.0, ge=0, le=25000)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=500)
    ai_raw_response: Optional[str] = None
    is_manually_edited: bool = False
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)

    _check_photo = field_validator("photo_path")(classmethod(lambda cls, v: _validate_safe_photo_path(v)))


class MealUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    calories: Optional[float] = Field(None, ge=0, le=50000)
    protein: Optional[float] = Field(None, ge=0, le=10000)
    fat: Optional[float] = Field(None, ge=0, le=10000)
    carbs: Optional[float] = Field(None, ge=0, le=10000)
    weight_grams: Optional[float] = Field(None, ge=0, le=25000)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=500)
    is_manually_edited: Optional[bool] = True
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None
    ingredients: Optional[List[MealIngredientItem]] = None

    _check_photo = field_validator("photo_path")(classmethod(lambda cls, v: _validate_safe_photo_path(v)))


class MealCopyRequest(BaseModel):
    target_date: Optional[date] = None
    target_time: Optional[time] = None


class MealRecalculateRequest(BaseModel):
    user_comment: Optional[str] = Field(None, max_length=500, description="Новое пояснение к блюду для пересчёта AI")


class MealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    calories: float
    protein: float
    fat: float
    carbs: float
    weight_grams: Optional[float] = 0.0
    photo_path: Optional[str] = None
    user_comment: Optional[str] = None
    ai_raw_response: Optional[str] = None
    is_manually_edited: bool
    meal_date: date
    meal_time: time
    created_at: datetime
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class DailyMealsSummary(BaseModel):
    date: date
    total_calories: float
    total_protein: float
    total_fat: float
    total_carbs: float
    target_calories: int
    goal_calories: Optional[int] = None
    target_protein: int
    goal_protein: Optional[int] = None
    target_fat: int
    goal_fat: Optional[int] = None
    target_carbs: int
    goal_carbs: Optional[int] = None
    meals: List[MealResponse]
