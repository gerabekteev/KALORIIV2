from datetime import date, datetime
from typing import Optional, Literal, List
from pydantic import BaseModel, Field, field_validator, ConfigDict, AliasChoices


class MealIngredientItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    weight_grams: float = Field(..., ge=0, le=25000)
    calories: float = Field(..., ge=0, le=50000)
    protein: float = Field(..., ge=0, le=10000)
    fat: float = Field(..., ge=0, le=10000)
    carbs: float = Field(..., ge=0, le=10000)


class FoodAnalysisResult(BaseModel):
    name: str = Field(..., description="Food or dish name")
    weight_grams: float = Field(..., ge=0, le=25000, description="Estimated weight in grams")
    calories: float = Field(..., ge=0, le=50000, description="Calories in kcal")
    protein: float = Field(..., ge=0, le=10000, description="Protein in grams")
    fat: float = Field(..., ge=0, le=10000, description="Fat in grams")
    carbs: float = Field(..., ge=0, le=10000, description="Carbohydrates in grams")
    confidence: Literal["high", "medium", "low"] = Field(
        "medium", description="Confidence level of recognition"
    )
    transcription: Optional[str] = Field(
        None, description="Verbatim voice transcription if recognized from audio"
    )
    raw_response: Optional[str] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class FoodRecognitionResponse(BaseModel):
    name: str
    weight_grams: float = Field(..., ge=0, le=25000)
    calories: float = Field(..., ge=0, le=50000)
    protein: float = Field(..., ge=0, le=10000)
    fat: float = Field(..., ge=0, le=10000)
    carbs: float = Field(..., ge=0, le=10000)
    confidence: str
    photo_path: Optional[str] = None
    transcription: Optional[str] = None
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    raw_response: Optional[str] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class TextAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Текстовое описание блюда или продуктов")

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Описание блюда не может быть пустым")
        return trimmed


class PlannedMealItem(BaseModel):
    id: str = Field(..., description="Уникальный локальный ID карточки блюда в плане")
    meal_label: str = Field(default="Приём пищи", description="Например: Приём пищи 1 / Завтрак / Обед / Ужин")
    name: str = Field(..., min_length=1, max_length=255)
    weight_grams: float = Field(..., ge=0, le=25000)
    calories: float = Field(..., ge=0, le=50000)
    protein: float = Field(..., ge=0, le=10000)
    fat: float = Field(..., ge=0, le=10000)
    carbs: float = Field(..., ge=0, le=10000)
    ingredients: List[MealIngredientItem] = Field(default_factory=list)
    locked: bool = Field(default=False, description="Если True — блюдо закреплено пользователем и не перегенерируется")
    added_to_diary: bool = Field(default=False, description="Отметка, что пользователь уже добавил это блюдо в дневник")


class MealPlanGenerateRequest(BaseModel):
    plan_date: date = Field(..., description="Дата, на которую планируется питание")
    meals_count: int = Field(default=3, ge=1, le=6, description="Общее количество блюд/приёмов пищи")
    target_calories: float = Field(..., ge=100, le=15000, description="Лимит калорий (главный приоритет — не превысить!)")
    target_protein: float = Field(default=100, ge=0, le=2000)
    target_fat: float = Field(default=50, ge=0, le=2000)
    target_carbs: float = Field(default=150, ge=0, le=3000)
    user_preferences: Optional[str] = Field(None, max_length=500, description="Пожелания или исключения")
    locked_meals: List[PlannedMealItem] = Field(
        default_factory=list,
        description="Блюда, которые пользователь решил оставить (закрепил) при перегенерации остальных",
    )


class MealPlanSaveRequest(BaseModel):
    plan_date: date
    meals_count: int = Field(default=3, ge=1, le=6)
    target_calories: float = Field(..., ge=50, le=15000)
    target_protein: float = Field(default=0, ge=0, le=2000)
    target_fat: float = Field(default=0, ge=0, le=2000)
    target_carbs: float = Field(default=0, ge=0, le=3000)
    user_preferences: Optional[str] = Field(None, max_length=500)
    meals: List[PlannedMealItem] = Field(default_factory=list)


class MealPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    plan_date: date
    meals_count: int
    target_calories: float
    target_protein: float
    target_fat: float
    target_carbs: float
    user_preferences: Optional[str] = None
    total_generated_calories: float = 0.0
    total_generated_protein: float = 0.0
    total_generated_fat: float = 0.0
    total_generated_carbs: float = 0.0
    meals: List[PlannedMealItem] = Field(default_factory=list)
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    updated_at: Optional[datetime] = None


class AISettingsModelItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    provider: str
    description: Optional[str] = None
    enabled: bool = True


class UserAISettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    models: List[AISettingsModelItem]
    gemini_api_key: Optional[str] = Field(None, validation_alias=AliasChoices("gemini_api_key", "geminiApiKey"))
    openrouter_api_key: Optional[str] = Field(None, validation_alias=AliasChoices("openrouter_api_key", "openrouterApiKey"))
    geminiApiKey: Optional[str] = None
    openrouterApiKey: Optional[str] = None


class UserAISettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    models: List[AISettingsModelItem]
    gemini_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    geminiApiKey: Optional[str] = None
    openrouterApiKey: Optional[str] = None
