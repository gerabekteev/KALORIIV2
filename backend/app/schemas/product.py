import re
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


def _validate_safe_product_image(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    val = v.strip()
    if not val:
        return None
    if val.startswith(("http://", "https://")):
        if any(c in val for c in ["\r", "\n", "\t", " ", "<", ">", '"', "'"]):
            raise ValueError("Недопустимый формат URL изображения продукта")
        return val
    clean_name = val.replace("/uploads/", "").replace("uploads/", "").lstrip("/")
    if ".." in clean_name or "/" in clean_name or "\\" in clean_name:
        raise ValueError("Недопустимый путь к изображению продукта")
    if not re.match(r"^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$", clean_name, re.IGNORECASE):
        raise ValueError("Недопустимый формат имени файла изображения продукта")
    return f"/uploads/{clean_name}"


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

    _check_img = field_validator("image_url")(classmethod(lambda cls, v: _validate_safe_product_image(v)))


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

    _check_img = field_validator("image_url")(classmethod(lambda cls, v: _validate_safe_product_image(v)))


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
