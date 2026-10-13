from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.product import Product


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    total_calories: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_protein: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_fat: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_carbs: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_weight_grams: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="recipes")
    items: Mapped[List["RecipeItem"]] = relationship(
        "RecipeItem", back_populates="recipe", cascade="all, delete-orphan", lazy="selectin"
    )


class RecipeItem(Base):
    __tablename__ = "recipe_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    weight_grams: Mapped[float] = mapped_column(Float, nullable=False)

    # Relationships
    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="recipe_items", lazy="joined")
