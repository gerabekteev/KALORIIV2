from datetime import datetime, date, time
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Float, Integer, Boolean, DateTime, Date, Time, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    calories: Mapped[float] = mapped_column(Float, nullable=False)
    protein: Mapped[float] = mapped_column(Float, nullable=False)
    fat: Mapped[float] = mapped_column(Float, nullable=False)
    carbs: Mapped[float] = mapped_column(Float, nullable=False)
    weight_grams: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)

    photo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user_comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ai_raw_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    meal_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_time: Mapped[time] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="meals")
