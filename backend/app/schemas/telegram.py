from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class ShoppingItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=255)
    total_grams: float = Field(default=0.0, ge=0, validation_alias=AliasChoices("total_grams", "totalGrams"))
    category: str = Field(default="🛒 Прочие продукты", max_length=100)
    checked: bool = False


class ShoppingListRequest(BaseModel):
    items: List[ShoppingItem] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=500)
