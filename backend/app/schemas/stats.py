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
    goal_met_days: int
    goal_met_percentage: float
    average_calories: float
    average_protein: float
    average_fat: float
    average_carbs: float
    macro_distribution: MacroDistribution
    daily_stats: List[DayStats]


class WeightHistoryPoint(BaseModel):
    date: date
    weight_kg: float


class WeightStatsResponse(BaseModel):
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    start_weight: Optional[float] = None
    change_kg: Optional[float] = None
    history: List[WeightHistoryPoint]
