from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class BarcodeLookupRequest(BaseModel):
    barcode: str = Field(..., min_length=3, max_length=150, description="Штрихкод или DataMatrix Честный Знак")


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


class BarcodeScanImageResponse(BaseModel):
    detected_code: Optional[str] = None
    is_honest_sign: bool = False
    product: Optional[BarcodeProductResult] = None
    message: Optional[str] = None
