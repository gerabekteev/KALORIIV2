from typing import Optional, Literal, List
from pydantic import BaseModel, Field, field_validator, ConfigDict, AliasChoices


class MealIngredientItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    weight_grams: float = Field(..., ge=0)
    calories: float = Field(..., ge=0)
    protein: float = Field(..., ge=0)
    fat: float = Field(..., ge=0)
    carbs: float = Field(..., ge=0)


class FoodAnalysisResult(BaseModel):
    name: str = Field(..., description="Food or dish name")
    weight_grams: float = Field(..., ge=0, description="Estimated weight in grams")
    calories: float = Field(..., ge=0, description="Calories in kcal")
    protein: float = Field(..., ge=0, description="Protein in grams")
    fat: float = Field(..., ge=0, description="Fat in grams")
    carbs: float = Field(..., ge=0, description="Carbohydrates in grams")
    confidence: Literal["high", "medium", "low"] = Field(
        "medium", description="Confidence level of recognition"
    )
    raw_response: Optional[str] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class FoodRecognitionResponse(BaseModel):
    name: str
    weight_grams: float
    calories: float
    protein: float
    fat: float
    carbs: float
    confidence: str
    photo_path: Optional[str] = None
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


