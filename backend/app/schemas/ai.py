from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator


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


class TextAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Текстовое описание блюда или продуктов")

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Описание блюда не может быть пустым")
        return trimmed
