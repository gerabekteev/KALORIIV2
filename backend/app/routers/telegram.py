import html
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from collections import defaultdict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.telegram import ShoppingListRequest
from app.services.auth import get_current_user
from app.services.telegram_bot import telegram_bot_service

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
    if exp and exp < datetime.now(timezone.utc).replace(tzinfo=None):
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
    from sqlalchemy import select

    code = f"KLR-{secrets.randbelow(900000) + 100000}"
    for _ in range(5):
        existing = await db.execute(select(User.id).where(User.telegram_link_code == code).limit(1))
        if not existing.scalar_one_or_none():
            break
        code = f"KLR-{secrets.randbelow(900000) + 100000}"

    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15)

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


@router.post("/send-shopping-list")
async def send_shopping_list(
    payload: ShoppingListRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Send formatted grocery shopping list from daily menu plan directly to user's Telegram chat.
    Requires user to have linked their Telegram bot account.
    """
    from app.routers.ai import check_ai_rate_limit
    check_ai_rate_limit(current_user.id)

    if not current_user.telegram_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram-бот не привязан к вашему профилю. Сгенерируйте код в настройках профиля и отправьте его боту.",
        )

    if not telegram_bot_service.token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис Telegram-бота временно не настроен на сервере.",
        )

    items_to_send = [item for item in payload.items if not item.checked]
    if not items_to_send:
        items_to_send = payload.items

    categories = defaultdict(list)
    for item in items_to_send:
        cat = item.category or "🛒 Прочие продукты"
        categories[cat].append(item)

    lines = [
        "🛒 <b>Ваш список покупок KaloriiAI</b>\n",
    ]

    for cat_name, items in categories.items():
        lines.append(f"<b>{html.escape(cat_name)}:</b>")
        for it in items:
            weight_str = f" — {round(it.total_grams)}г" if it.total_grams > 0 else ""
            lines.append(f"  ▫️ {html.escape(it.name)}{weight_str}")
        lines.append("")

    if payload.notes and payload.notes.strip():
        lines.append(f"📝 <i>Заметка: {html.escape(payload.notes.strip())}</i>\n")

    lines.append("<i>Приятных покупок и вкусного рациона! 🍏</i>")
    text = "\n".join(lines)

    msg_id = await telegram_bot_service.send_message(
        chat_id=current_user.telegram_chat_id,
        text=text,
    )

    if not msg_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось доставить сообщение в Telegram. Убедитесь, что бот не заблокирован в вашем чате.",
        )

    return {
        "success": True,
        "message": "Список покупок успешно отправлен в Telegram-бот!",
    }
