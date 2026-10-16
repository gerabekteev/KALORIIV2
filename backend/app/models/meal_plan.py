import json
from datetime import datetime, date
from typing import TYPE_CHECKING, Optional, List, Any
from sqlalchemy import String, Float, Integer, DateTime, Date, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class MealPlan(Base):
    __tablename__ = "meal_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "plan_date", name="uq_meal_plans_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    meals_count: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    target_calories: Mapped[float] = mapped_column(Float, nullable=False)
    target_protein: Mapped[float] = mapped_column(Float, nullable=False)
    target_fat: Mapped[float] = mapped_column(Float, nullable=False)
    target_carbs: Mapped[float] = mapped_column(Float, nullable=False)
    user_preferences: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    meals_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    provider_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="meal_plans")

    @property
    def meals(self) -> List[dict[str, Any]]:
        if not self.meals_json:
            return []
        try:
            data = json.loads(self.meals_json)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    @meals.setter
    def meals(self, value: Any) -> None:
        if value is None:
            self.meals_json = "[]"
        elif isinstance(value, str):
            self.meals_json = value
        else:
            self.meals_json = json.dumps(value, ensure_ascii=False)
