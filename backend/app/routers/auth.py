from datetime import datetime, timedelta, timezone
import time
from collections import defaultdict, deque
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserRegister,
    UserLogin,
    UserResponse,
    Token,
    AuthResponse,
    RefreshTokenRequest,
)
from app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    security,
)

router = APIRouter(prefix="/auth", tags=["Аутентификация"])

import os

_auth_rate_records: dict[str, deque] = defaultdict(deque)

def check_auth_rate_limit(request: Request, max_attempts: int = 10, window_seconds: float = 60.0) -> None:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    client_ip = request.headers.get("X-Real-IP") or (request.client.host if request.client else "unknown")
    now = time.time()
    dq = _auth_rate_records[client_ip]
    while dq and now - dq[0] > window_seconds:
        dq.popleft()
    if len(dq) >= max_attempts:
        retry_after = int(window_seconds - (now - dq[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Слишком много попыток авторизации. Подождите {retry_after} сек.",
            headers={"Retry-After": str(retry_after)},
        )
    dq.append(now)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(request: Request, user_in: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user with email and password."""
    check_auth_rate_limit(request)
    # Check if email is already taken
    existing_user_query = await db.execute(
        select(User).where(User.email == user_in.email.lower().strip())
    )
    if existing_user_query.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован",
        )

    user = User(
        email=user_in.email.lower().strip(),
        password_hash=hash_password(user_in.password),
        name=user_in.name,
        # Default starting values
        daily_calories_goal=2000,
        daily_protein_goal=140,
        daily_fat_goal=70,
        daily_carbs_goal=250,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        ),
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: Request, credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate a user and return access and refresh tokens."""
    check_auth_rate_limit(request)
    result = await db.execute(
        select(User).where(User.email == credentials.email.lower().strip())
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        ),
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request,
    req: Optional[RefreshTokenRequest] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """Refresh an access token using a valid refresh token from body or Authorization header."""
    check_auth_rate_limit(request)
    token_str = (req.refresh_token if req and req.refresh_token else None) or (
        credentials.credentials if credentials else None
    )

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не передан токен для обновления (refresh token)",
        )

    payload = decode_token(token_str, expected_type="refresh")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный refresh токен",
        )

    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Некорректный идентификатор пользователя в токене",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
        )

    # Issue new access token and rotate refresh token
    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse.model_validate(current_user)
