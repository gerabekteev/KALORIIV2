from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class BarcodeLookupRequest(BaseModel):
    barcode: str = Field(..., min_length=3, max_length=150, description="Штрихкод или DataMatrix Честный Знак")
    refresh: bool = Field(default=False, description="Принудительно запросить свежие данные из онлайн-базы")


class BarcodeProductUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Название продукта")
    brand: Optional[str] = Field(None, max_length=100, description="Бренд или производитель")
    calories_per_100g: float = Field(..., ge=0, description="Калории на 100г")
    protein_per_100g: float = Field(..., ge=0, description="Белки на 100г")
    fat_per_100g: float = Field(..., ge=0, description="Жиры на 100г")
    carbs_per_100g: float = Field(..., ge=0, description="Углеводы на 100г")
    package_weight_grams: Optional[float] = Field(default=100.0, ge=1, description="Вес базовой упаковки (г)")
    image_url: Optional[str] = Field(None, description="Ссылка на фото упаковки")


class BarcodeProductResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: Optional[int] = None
    name: str
    brand: Optional[str] = None
    barcode: str
    calories_per_100g: float
    protein_per_100g: float
    fat_per_100g: float
    carbs_per_100g: float
    package_weight_grams: float = 100.0
    image_url: Optional[str] = None
    source: str = "openfoodfacts"  # "local", "openfoodfacts", "ai_vision"
    is_honest_sign: bool = False


class RecentScannedProductItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    name: str
    brand: Optional[str] = None
    barcode: Optional[str] = None
    calories_per_100g: float
    protein_per_100g: float
    fat_per_100g: float
    carbs_per_100g: float
    package_weight_grams: float = 100.0
    image_url: Optional[str] = None
    last_scanned_at: str
    scan_count: int = 1
    is_honest_sign: bool = False


class BarcodeScanImageResponse(BaseModel):
    detected_code: Optional[str] = None
    is_honest_sign: bool = False
    product: Optional[BarcodeProductResult] = None
    message: Optional[str] = None
