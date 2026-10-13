from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class DayStats(BaseModel):
    date: date
    calories: float
    protein: float
    fat: float
    carbs: float
    meals_count: int
    goal_calories: int
    target_calories: Optional[int] = None
    goal_protein: int
    goal_fat: int
    goal_carbs: int
    goal_achieved: bool


class MacroDistribution(BaseModel):
    protein_grams: float
    fat_grams: float
    carbs_grams: float
    protein_percent: float
    fat_percent: float
    carbs_percent: float


class StatsPeriodResponse(BaseModel):
    period: str
    start_date: date
    end_date: date
    total_days: int
    tracked_days: int
    days_tracked: Optional[int] = None
    goal_met_days: int
    goal_met_percentage: float
    target_met_percentage: Optional[float] = None
    total_calories: Optional[float] = 0.0
    average_calories: float
    avg_calories: Optional[float] = None
    average_protein: float
    avg_protein: Optional[float] = None
    average_fat: float
    avg_fat: Optional[float] = None
    average_carbs: float
    avg_carbs: Optional[float] = None
    macro_distribution: MacroDistribution
    daily_stats: List[DayStats]
    days: Optional[List[DayStats]] = None


class WeightHistoryPoint(BaseModel):
    id: Optional[int] = None
    date: date
    log_date: Optional[date] = None
    weight_kg: float


class WeightStatsResponse(BaseModel):
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    start_weight: Optional[float] = None
    change_kg: Optional[float] = None
    history: List[WeightHistoryPoint]
