from datetime import datetime, date, time
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class MealCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    calories: float = Field(..., ge=0)
    protein: float = Field(..., ge=0)
    fat: float = Field(..., ge=0)
    carbs: float = Field(..., ge=0)
    weight_grams: Optional[float] = Field(0.0, ge=0)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=500)
    ai_raw_response: Optional[str] = None
    is_manually_edited: bool = False
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None


class MealUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    calories: Optional[float] = Field(None, ge=0)
    protein: Optional[float] = Field(None, ge=0)
    fat: Optional[float] = Field(None, ge=0)
    carbs: Optional[float] = Field(None, ge=0)
    weight_grams: Optional[float] = Field(None, ge=0)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=500)
    is_manually_edited: Optional[bool] = True
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None


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
