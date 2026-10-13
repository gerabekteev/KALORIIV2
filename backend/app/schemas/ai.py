from typing import Optional, Literal
from pydantic import BaseModel, Field


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
