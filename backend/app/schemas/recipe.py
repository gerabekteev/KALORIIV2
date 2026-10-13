from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from app.schemas.product import ProductResponse


class RecipeItemCreate(BaseModel):
    product_id: int
    weight_grams: float = Field(..., gt=0)


class RecipeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipe_id: int
    product_id: int
    weight_grams: float
    product: Optional[ProductResponse] = None


class RecipeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    items: List[RecipeItemCreate] = Field(default_factory=list)


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    items: Optional[List[RecipeItemCreate]] = None
    is_favorite: Optional[bool] = None


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    total_calories: float
    total_protein: float
    total_fat: float
    total_carbs: float
    total_weight_grams: float
    is_favorite: bool
    created_at: datetime
    items: List[RecipeItemResponse] = Field(default_factory=list)
