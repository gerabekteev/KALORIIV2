from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    calories_per_100g: float = Field(..., ge=0, le=10000)
    protein_per_100g: float = Field(..., ge=0, le=1000)
    fat_per_100g: float = Field(..., ge=0, le=1000)
    carbs_per_100g: float = Field(..., ge=0, le=1000)
    category: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    brand: Optional[str] = Field(None, max_length=255)
    image_url: Optional[str] = Field(None, max_length=500)
    package_weight_grams: Optional[float] = Field(100.0, ge=0, le=25000)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    calories_per_100g: Optional[float] = Field(None, ge=0, le=10000)
    protein_per_100g: Optional[float] = Field(None, ge=0, le=1000)
    fat_per_100g: Optional[float] = Field(None, ge=0, le=1000)
    carbs_per_100g: Optional[float] = Field(None, ge=0, le=1000)
    category: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    brand: Optional[str] = Field(None, max_length=255)
    image_url: Optional[str] = Field(None, max_length=500)
    package_weight_grams: Optional[float] = Field(None, ge=0, le=25000)


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    calories_per_100g: float
    protein_per_100g: float
    fat_per_100g: float
    carbs_per_100g: float
    category: Optional[str] = None
    barcode: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    package_weight_grams: Optional[float] = 100.0
    is_custom: bool
    created_by_user_id: Optional[int] = None
