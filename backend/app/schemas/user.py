from datetime import datetime, date
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: Optional[str] = Field(None, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    user: "UserResponse"
    token: Token
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: int
    type: str  # "access" or "refresh"


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    height_cm: Optional[float] = Field(None, ge=50, le=280)
    current_weight_kg: Optional[float] = Field(None, ge=20, le=400)
    target_weight_kg: Optional[float] = Field(None, ge=20, le=400)
    age: Optional[int] = Field(None, ge=10, le=120)
    gender: Optional[Literal["male", "female"]] = None
    activity_level: Optional[
        Literal["sedentary", "light", "moderate", "active", "very_active"]
    ] = None
    daily_calories_goal: Optional[int] = Field(None, ge=500, le=10000)
    daily_protein_goal: Optional[int] = Field(None, ge=10, le=1000)
    daily_fat_goal: Optional[int] = Field(None, ge=10, le=500)
    daily_carbs_goal: Optional[int] = Field(None, ge=10, le=1500)
    timezone: Optional[str] = Field(None, max_length=50)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: Optional[str] = None
    height_cm: Optional[float] = None
    current_weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    daily_calories_goal: int
    daily_protein_goal: int
    daily_fat_goal: int
    daily_carbs_goal: int
    timezone: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class WeightLogCreate(BaseModel):
    weight_kg: float = Field(..., ge=20, le=400)
    log_date: Optional[date] = None


class WeightLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    weight_kg: float
    log_date: date


class ProfileCalculateRequest(BaseModel):
    height_cm: Optional[float] = Field(None, ge=50, le=280)
    weight_kg: Optional[float] = Field(None, ge=20, le=400)
    current_weight_kg: Optional[float] = Field(None, ge=20, le=400)
    target_weight_kg: Optional[float] = Field(None, ge=20, le=400)
    age: Optional[int] = Field(None, ge=10, le=120)
    gender: Optional[Literal["male", "female"]] = None
    activity_level: Optional[
        Literal["sedentary", "light", "moderate", "active", "very_active"]
    ] = None
    goal: Optional[str] = "maintain"
    goal_type: Optional[str] = None


class ProfileCalculateResponse(BaseModel):
    bmr: float
    tdee: float
    daily_calories_goal: int
    daily_protein_goal: int
    daily_fat_goal: int
    daily_carbs_goal: int
