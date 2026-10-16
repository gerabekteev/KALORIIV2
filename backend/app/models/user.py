from datetime import datetime, date
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.meal import Meal
    from app.models.product import Product
    from app.models.recipe import Recipe
    from app.models.scanned_product import UserScannedProduct
    from app.models.meal_plan import MealPlan


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Physical parameters
    height_cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # male / female
    activity_level: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # sedentary / light / moderate / active / very_active

    # Daily goals
    daily_calories_goal: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    daily_protein_goal: Mapped[int] = mapped_column(Integer, default=140, nullable=False)
    daily_fat_goal: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    daily_carbs_goal: Mapped[int] = mapped_column(Integer, default=250, nullable=False)

    # AI settings
    ai_settings_json: Mapped[Optional[str]] = mapped_column(String(4000), nullable=True)

    # Telegram integration
    telegram_chat_id: Mapped[Optional[int]] = mapped_column(
        Integer, unique=True, index=True, nullable=True
    )
    telegram_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    telegram_link_code: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    telegram_link_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    meals: Mapped[List["Meal"]] = relationship(
        "Meal", back_populates="user", cascade="all, delete-orphan"
    )
    recipes: Mapped[List["Recipe"]] = relationship(
        "Recipe", back_populates="user", cascade="all, delete-orphan"
    )
    weight_logs: Mapped[List["WeightLog"]] = relationship(
        "WeightLog", back_populates="user", cascade="all, delete-orphan"
    )
    custom_products: Mapped[List["Product"]] = relationship(
        "Product", back_populates="creator"
    )
    scanned_products: Mapped[List["UserScannedProduct"]] = relationship(
        "UserScannedProduct", back_populates="user", cascade="all, delete-orphan"
    )
    meal_plans: Mapped[List["MealPlan"]] = relationship(
        "MealPlan", back_populates="user", cascade="all, delete-orphan"
    )


class WeightLog(Base):
    __tablename__ = "weight_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="weight_logs")
