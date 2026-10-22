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
    PasswordChangeRequest,
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
import ipaddress

_auth_rate_records: dict[str, deque] = defaultdict(deque)
_last_auth_cleanup: float = 0.0

TRUSTED_PROXIES = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
]


def _is_trusted_proxy(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
        return any(ip in net for net in TRUSTED_PROXIES)
    except Exception:
        return False


def _get_client_ip(request: Request) -> str:
    remote_host = request.client.host if request.client else "unknown"
    if _is_trusted_proxy(remote_host):
        real_ip = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For")
        if real_ip:
            return real_ip.split(",")[0].strip()
    return remote_host


def _cleanup_stale_auth_records(now: float, window_seconds: float = 60.0) -> None:
    global _last_auth_cleanup
    if (now - _last_auth_cleanup < 300.0) and len(_auth_rate_records) <= 500:
        return
    _last_auth_cleanup = now
    stale_keys = [k for k, dq in _auth_rate_records.items() if not dq or (now - dq[-1] > window_seconds)]
    for k in stale_keys:
        _auth_rate_records.pop(k, None)


def check_auth_rate_limit(
    request: Request,
    key_suffix: Optional[str] = None,
    max_attempts: int = 10,
    window_seconds: float = 60.0,
) -> None:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    now = time.time()
    _cleanup_stale_auth_records(now, window_seconds)
    client_ip = _get_client_ip(request)
    limit_key = f"{client_ip}:{key_suffix.lower().strip()}" if key_suffix else client_ip
    dq = _auth_rate_records[limit_key]
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
    check_auth_rate_limit(request, key_suffix=user_in.email)
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

    access_token = create_access_token(user.id, getattr(user, "token_version", 1))
    refresh_token = create_refresh_token(user.id, getattr(user, "token_version", 1))

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
    check_auth_rate_limit(request, key_suffix=credentials.email)
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

    access_token = create_access_token(user.id, getattr(user, "token_version", 1))
    refresh_token = create_refresh_token(user.id, getattr(user, "token_version", 1))

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

    token_ver = payload.get("ver", 1)
    if getattr(user, "token_version", 1) != token_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия была завершена (токен отозван)",
        )

    # Issue new access token and rotate refresh token with active version
    new_access_token = create_access_token(user.id, getattr(user, "token_version", 1))
    new_refresh_token = create_refresh_token(user.id, getattr(user, "token_version", 1))

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all active tokens for current user by incrementing token_version."""
    current_user.token_version = getattr(current_user, "token_version", 1) + 1
    await db.commit()
    return {"message": "Успешный выход из системы"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse.model_validate(current_user)


@router.post("/change-password", response_model=AuthResponse)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user password, invalidate old tokens, and return new tokens."""
    _check_auth_rate_limit(request)
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль указан неверно",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.token_version = getattr(current_user, "token_version", 1) + 1
    await db.commit()
    await db.refresh(current_user)

    access_token = create_access_token(current_user.id, current_user.token_version)
    refresh_token = create_refresh_token(current_user.id, current_user.token_version)

    return AuthResponse(
        user=UserResponse.model_validate(current_user),
        token=Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        ),
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )
