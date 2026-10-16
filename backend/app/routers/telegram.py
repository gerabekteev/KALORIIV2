import secrets
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/telegram", tags=["Telegram Бот"])


class TelegramStatusResponse(BaseModel):
    is_linked: bool
    telegram_username: Optional[str] = None
    telegram_chat_id: Optional[int] = None
    bot_username: Optional[str] = None
    link_code: Optional[str] = None
    deep_link_url: Optional[str] = None
    expires_at: Optional[datetime] = None


@router.get("/status", response_model=TelegramStatusResponse)
async def get_telegram_status(
    current_user: User = Depends(get_current_user),
):
    """Get current user's Telegram bot link status."""
    bot_user = settings.TELEGRAM_BOT_USERNAME.lstrip("@").strip() if settings.TELEGRAM_BOT_USERNAME else None
    code = current_user.telegram_link_code
    exp = current_user.telegram_link_expires_at
    if exp and exp < datetime.utcnow():
        code = None
        exp = None

    deep_link = f"https://t.me/{bot_user}?start={code}" if (bot_user and code) else None

    return TelegramStatusResponse(
        is_linked=bool(current_user.telegram_chat_id),
        telegram_username=current_user.telegram_username,
        telegram_chat_id=current_user.telegram_chat_id,
        bot_username=bot_user,
        link_code=code,
        deep_link_url=deep_link,
        expires_at=exp,
    )


@router.post("/link-code", response_model=TelegramStatusResponse)
async def generate_telegram_link_code(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a 15-minute one-time code for linking Telegram account to KaloriiAI."""
    code = f"KLR-{secrets.randbelow(900000) + 100000}"
    expires = datetime.utcnow() + timedelta(minutes=15)

    current_user.telegram_link_code = code
    current_user.telegram_link_expires_at = expires
    await db.commit()
    await db.refresh(current_user)

    bot_user = settings.TELEGRAM_BOT_USERNAME.lstrip("@").strip() if settings.TELEGRAM_BOT_USERNAME else None
    deep_link = f"https://t.me/{bot_user}?start={code}" if bot_user else None

    return TelegramStatusResponse(
        is_linked=bool(current_user.telegram_chat_id),
        telegram_username=current_user.telegram_username,
        telegram_chat_id=current_user.telegram_chat_id,
        bot_username=bot_user,
        link_code=code,
        deep_link_url=deep_link,
        expires_at=expires,
    )


@router.delete("/unlink", response_model=TelegramStatusResponse)
async def unlink_telegram_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlink Telegram account from current user."""
    current_user.telegram_chat_id = None
    current_user.telegram_username = None
    current_user.telegram_link_code = None
    current_user.telegram_link_expires_at = None
    await db.commit()
    await db.refresh(current_user)

    bot_user = settings.TELEGRAM_BOT_USERNAME.lstrip("@").strip() if settings.TELEGRAM_BOT_USERNAME else None
    return TelegramStatusResponse(
        is_linked=False,
        bot_username=bot_user,
    )
