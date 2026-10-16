import asyncio
import html
import json
import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, date as dt_date
from typing import Optional, Dict, Any, Set
import httpx
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.meal import Meal
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.routers.ai import resolve_ai_config, check_ai_rate_limit
from app.utils.image import process_image
from app.utils.timezone import get_user_now

logger = logging.getLogger("kalorii.telegram_bot")


class TelegramBotService:
    """
    Asynchronous Telegram Bot service using long-polling via httpx.
    Automatically logs meals from:
    1) Photos (+ optional caption as user_comment)
    2) Text messages (saved with text as user_comment)
    3) Voice messages (transcribed by AI; transcription saved into Meal.user_comment for web editing & recalculation)
    """

    def __init__(self):
        self._offset: int = 0
        self._running: bool = False
        self._tasks: Set[asyncio.Task] = set()
        self._user_locks: Dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._link_attempts: Dict[int, deque] = defaultdict(deque)

    @property
    def token(self) -> str:
        return (settings.TELEGRAM_BOT_TOKEN or "").strip()

    @property
    def base_url(self) -> str:
        return f"https://api.telegram.org/bot{self.token}"

    @property
    def file_base_url(self) -> str:
        return f"https://api.telegram.org/file/bot{self.token}"

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> Optional[int]:
        if not self.token:
            return None
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(f"{self.base_url}/sendMessage", json=payload)
                data = resp.json()
                if data.get("ok") and "result" in data:
                    return data["result"].get("message_id")
        except Exception as e:
            logger.warning(f"Failed to send Telegram message to {chat_id}: {e}")
        return None

    async def edit_message(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.token or not message_id:
            return
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.post(f"{self.base_url}/editMessageText", json=payload)
        except Exception as e:
            logger.debug(f"Failed to edit Telegram message {message_id}: {e}")

    async def answer_callback_query(
        self,
        callback_query_id: str,
        text: Optional[str] = None,
    ) -> None:
        """Answers Telegram callback query to immediately remove button loading spinner."""
        if not self.token or not callback_query_id:
            return
        payload: Dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(f"{self.base_url}/answerCallbackQuery", json=payload)
        except Exception as e:
            logger.debug(f"Failed to answer callback query {callback_query_id}: {e}")

    async def download_telegram_file(self, file_id: str) -> Optional[bytes]:
        """Download binary file (photo or voice .ogg) from Telegram servers."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                info_resp = await client.get(f"{self.base_url}/getFile", params={"file_id": file_id})
                info_data = info_resp.json()
                if not info_data.get("ok") or "result" not in info_data:
                    return None
                file_path = info_data["result"].get("file_path")
                if not file_path:
                    return None

                file_resp = await client.get(f"{self.file_base_url}/{file_path}")
                if file_resp.status_code == 200:
                    return file_resp.content
        except Exception as e:
            logger.error(f"Error downloading Telegram file {file_id}: {e}")
        return None

    async def _get_daily_summary_line(self, db: AsyncSession, user: User, meal_date: dt_date) -> str:
        """Compute user's total eaten and remaining calories for the day."""
        res = await db.execute(
            select(func.sum(Meal.calories)).where(
                and_(Meal.user_id == user.id, Meal.meal_date == meal_date)
            )
        )
        total_cal = round(float(res.scalar_one_or_none() or 0.0))
        goal = user.daily_calories_goal or 2000
        rem = goal - total_cal
        if rem >= 0:
            return f"📊 За день: <b>{total_cal} / {goal} ккал</b> (осталось <b>{rem} ккал</b>)"
        return f"📊 За день: <b>{total_cal} / {goal} ккал</b> (превышение на <b>{abs(rem)} ккал</b>)"

    async def _handle_link_code(
        self,
        db: AsyncSession,
        chat_id: int,
        username: Optional[str],
        code_raw: str,
    ) -> bool:
        # Rate limit link attempts: max 5 attempts per 15 minutes per chat_id
        now_ts = time.time()
        attempts = self._link_attempts[chat_id]
        while attempts and now_ts - attempts[0] > 900.0:
            attempts.popleft()
        if len(attempts) >= 5:
            await self.send_message(
                chat_id,
                "⚠️ <b>Слишком много попыток ввода кода.</b> Пожалуйста, подождите 15 минут перед повтором.",
            )
            return False
        attempts.append(now_ts)

        clean_code = code_raw.strip().upper()
        stmt = select(User).where(User.telegram_link_code == clean_code)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if not user:
            await self.send_message(
                chat_id,
                "❌ Код привязки не найден или устарел. Сгенерируйте новый код в разделе <b>Профиль → Telegram-бот</b> на сайте KaloriiAI.",
            )
            return False

        if user.telegram_link_expires_at and user.telegram_link_expires_at < datetime.utcnow():
            await self.send_message(
                chat_id,
                "⏳ Срок действия этого кода истёк (15 минут). Пожалуйста, нажмите «Обновить код» в профиле на сайте.",
            )
            return False

        # Отвязываем этот chat_id от других аккаунтов, если он был привязан ранее
        old_res = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
        for old_u in old_res.scalars().all():
            if old_u.id != user.id:
                old_u.telegram_chat_id = None
                old_u.telegram_username = None

        user.telegram_chat_id = chat_id
        user.telegram_username = username
        user.telegram_link_code = None
        user.telegram_link_expires_at = None
        await db.commit()

        safe_name = html.escape(str(user.name or user.email))
        await self.send_message(
            chat_id,
            f"✅ <b>Аккаунт успешно привязан к KaloriiAI!</b>\n"
            f"Профиль: <b>{safe_name}</b> (цель: {user.daily_calories_goal} ккал/день).\n\n"
            "Теперь просто отправляйте мне:\n"
            "📸 <b>Любое фото еды</b> (можно с подписью-уточнением)\n"
            "💬 <b>Любое текстовое сообщение</b> (например: <i>«Овсянка 200г с бананом и кофе»</i>)\n"
            "🎤 <b>Любое голосовое сообщение</b> — я расшифрую его, посчитаю КБЖУ и сохраню расшифровку в описание блюда на сайте!",
        )
        return True

    async def handle_update(self, update: Dict[str, Any]) -> None:
        async with AsyncSessionLocal() as db:
            # 1. Handle inline button callback (e.g. Delete Meal)
            if "callback_query" in update:
                cb = update["callback_query"]
                cb_id = cb.get("id")
                if cb_id:
                    await self.answer_callback_query(cb_id)

                cb_data = cb.get("data", "")
                msg = cb.get("message", {})
                chat_id = msg.get("chat", {}).get("id")
                message_id = msg.get("message_id")

                if cb_data.startswith("del_meal:") and chat_id:
                    meal_id = int(cb_data.split(":")[1])
                    u_res = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
                    user = u_res.scalar_one_or_none()
                    if user:
                        m_res = await db.execute(
                            select(Meal).where(and_(Meal.id == meal_id, Meal.user_id == user.id))
                        )
                        meal = m_res.scalar_one_or_none()
                        if meal:
                            meal_name = meal.name
                            target_meal_date = meal.meal_date
                            # Clean up photo file from disk if present
                            if meal.photo_path:
                                photo_name = meal.photo_path.replace("/uploads/", "")
                                file_path = settings.UPLOAD_DIR / photo_name
                                if file_path.exists():
                                    try:
                                        file_path.unlink()
                                    except Exception:
                                        pass

                            await db.delete(meal)
                            await db.commit()
                            summary_line = await self._get_daily_summary_line(db, user, target_meal_date)
                            safe_m_name = html.escape(str(meal_name))
                            await self.edit_message(
                                chat_id,
                                message_id,
                                f"🗑 Запись <b>«{safe_m_name}»</b> удалена из дневника.\n\n{summary_line}",
                            )
                return

            message = update.get("message")
            if not message:
                return

            chat = message.get("chat", {})
            chat_id = chat.get("id")
            if not chat_id:
                return

            # Security: ignore non-private group or channel chats
            if chat.get("type") != "private":
                logger.debug(f"Ignoring non-private message from chat {chat_id} of type {chat.get('type')}")
                return

            from_user = message.get("from", {})
            tg_username = from_user.get("username")

            text = (message.get("text") or "").strip()

            # Handle /start or /link command with KLR-XXXXXX code
            if text.startswith("/start") or text.startswith("/link"):
                parts = text.split()
                if len(parts) > 1 and parts[1].strip().upper().startswith("KLR-"):
                    await self._handle_link_code(db, chat_id, tg_username, parts[1].strip())
                    return
                elif len(parts) == 1:
                    # Check if already linked
                    res = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
                    user = res.scalar_one_or_none()
                    if user:
                        safe_u_name = html.escape(str(user.name or user.email))
                        await self.send_message(
                            chat_id,
                            f"👋 Здравствуйте, <b>{safe_u_name}</b>!\n"
                            "Ваш Telegram уже привязан к KaloriiAI.\n\n"
                            "📸 Отправьте фото еды\n"
                            "💬 Напишите текстом, что съели\n"
                            "🎤 Отправьте голосовое сообщение\n\n"
                            "И я сразу добавлю блюдо в ваш рацион!",
                        )
                    else:
                        await self.send_message(
                            chat_id,
                            "👋 <b>Добро пожаловать в KaloriiAI Bot!</b>\n\n"
                            "Чтобы логировать приёмы пищи через Telegram, привяжите ваш аккаунт:\n"
                            "1. Откройте приложение KaloriiAI на сайте\n"
                            "2. Перейдите во вкладку <b>«Профиль» → «Telegram-бот»</b>\n"
                            "3. Скопируйте 6-значный код (например, <code>KLR-A1B2C3</code>) и отправьте его сюда сообщением.",
                        )
                    return

            # Check if text itself is a link code
            if text.upper().startswith("KLR-"):
                await self._handle_link_code(db, chat_id, tg_username, text)
                return

            # Find linked user
            res = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
            user = res.scalar_one_or_none()
            if not user:
                await self.send_message(
                    chat_id,
                    "⚠️ <b>Ваш аккаунт ещё не привязан к KaloriiAI.</b>\n\n"
                    "Перейдите в раздел <b>Профиль → Telegram-бот</b> на сайте KaloriiAI, скопируйте персональный код привязки и отправьте его сюда.",
                )
                return

            # Acquire per-user lock to prevent concurrent race conditions
            async with self._user_locks[user.id]:
                # Check help commands
                if text in ("/help", "Помощь", "помощь", "инфо"):
                    await self.send_message(
                        chat_id,
                        "Отправьте мне фото еды, голосовое сообщение или просто напишите текстом, что вы съели — я автоматически посчитаю КБЖУ и добавлю запись в ваш дневник!",
                    )
                    return

                # Rate limit AI requests for this user
                try:
                    check_ai_rate_limit(user.id)
                except HTTPException:
                    await self.send_message(
                        chat_id,
                        "⏳ <b>Слишком много запросов к AI за короткое время.</b>\nПожалуйста, подождите минуту перед следующим анализом.",
                    )
                    return

                # Resolve user's AI settings & model priority chain
                custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(current_user=user)
                user_now = get_user_now(user)
                today_date = user_now.date()
                curr_time = user_now.time().replace(microsecond=0)

                # =========================================================================
                # СЦЕНАРИЙ 1: Фотография (или изображение документом) + прикреплённый текст
                # =========================================================================
                photo_list = message.get("photo")
                doc = message.get("document")
                is_image_doc = doc and str(doc.get("mime_type", "")).startswith("image/")

                if photo_list or is_image_doc:
                    status_msg_id = await self.send_message(chat_id, "⏳ <i>Анализирую фото блюда через AI...</i>")
                    file_id = photo_list[-1]["file_id"] if photo_list else doc["file_id"]
                    caption = (message.get("caption") or "").strip() or None

                    raw_bytes = await self.download_telegram_file(file_id)
                    if not raw_bytes:
                        await self.edit_message(chat_id, status_msg_id or 0, "❌ Не удалось загрузить фотографию с серверов Telegram.")
                        return

                    try:
                        compressed_bytes, _ = await asyncio.to_thread(process_image, raw_bytes)
                        filename = f"{uuid.uuid4().hex}.jpg"
                        dest_path = settings.UPLOAD_DIR / filename
                        dest_path.write_bytes(compressed_bytes)
                        relative_photo_path = f"/uploads/{filename}"
                    except Exception as e:
                        logger.error(f"Telegram image processing error: {e}")
                        await self.edit_message(chat_id, status_msg_id or 0, "❌ Не удалось обработать изображение.")
                        return

                    try:
                        result, prov_used, mod_used = await ai_router.recognize_food(
                            image_bytes=compressed_bytes,
                            mime_type="image/jpeg",
                            user_comment=caption,
                            custom_gemini_key=custom_gemini,
                            custom_openrouter_key=custom_openrouter,
                            custom_model_chain=custom_chain,
                        )
                    except Exception as e:
                        if dest_path.exists():
                            try:
                                dest_path.unlink()
                            except Exception:
                                pass
                        safe_err = html.escape(str(e))
                        await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка распознавания AI: {safe_err}")
                        return

                    meal = Meal(
                        user_id=user.id,
                        name=result.name,
                        calories=round(result.calories, 1),
                        protein=round(result.protein, 1),
                        fat=round(result.fat, 1),
                        carbs=round(result.carbs, 1),
                        weight_grams=round(result.weight_grams or 0.0, 1),
                        photo_path=relative_photo_path,
                        user_comment=caption,
                        ingredients_json=(
                            json.dumps([i.model_dump() for i in result.ingredients], ensure_ascii=False)
                            if result.ingredients
                            else None
                        ),
                        ai_raw_response=result.raw_response,
                        is_manually_edited=False,
                        meal_date=today_date,
                        meal_time=curr_time,
                    )
                    db.add(meal)
                    await db.commit()
                    await db.refresh(meal)

                    summary_line = await self._get_daily_summary_line(db, user, today_date)
                    ing_lines = ""
                    if result.ingredients:
                        ing_str = ", ".join(f"{html.escape(i.name)} ({round(i.weight_grams)}г)" for i in result.ingredients)
                        ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                    safe_meal_name = html.escape(str(meal.name))
                    safe_caption = html.escape(caption) if caption else ""
                    reply_text = (
                        f"✅ <b>Добавлено в дневник по фото:</b>\n"
                        f"🍽 <b>{safe_meal_name}</b> ({round(meal.weight_grams or 0)} г)\n"
                        f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                        f"{ing_lines}\n"
                        f"{f'💬 Описание: «{safe_caption}»' + chr(10) if safe_caption else ''}\n"
                        f"{summary_line}"
                    )
                    await self.edit_message(
                        chat_id,
                        status_msg_id or 0,
                        reply_text,
                        reply_markup={
                            "inline_keyboard": [[{"text": "🗑 Удалить запись", "callback_data": f"del_meal:{meal.id}"}]]
                        },
                    )
                    return

                # =========================================================================
                # СЦЕНАРИЙ 2: Голосовое сообщение (Voice) или Аудиофайл (Audio)
                # =========================================================================
                voice = message.get("voice") or message.get("audio")
                if voice:
                    status_msg_id = await self.send_message(chat_id, "⏳ <i>Слушаю голосовое сообщение и распознаю еду через AI...</i>")
                    file_id = voice["file_id"]
                    raw_audio = await self.download_telegram_file(file_id)
                    if not raw_audio:
                        await self.edit_message(chat_id, status_msg_id or 0, "❌ Не удалось загрузить голосовое сообщение с серверов Telegram.")
                        return

                    try:
                        result, prov_used, mod_used = await ai_router.recognize_food_voice(
                            audio_bytes=raw_audio,
                            mime_type="audio/ogg",
                            custom_gemini_key=custom_gemini,
                            custom_openrouter_key=custom_openrouter,
                            custom_model_chain=custom_chain,
                        )
                    except Exception as e:
                        safe_err = html.escape(str(e))
                        await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка распознавания голоса: {safe_err}")
                        return

                    transcription_text = (result.raw_response or result.name or "").strip()
                    meal = Meal(
                        user_id=user.id,
                        name=result.name,
                        calories=round(result.calories, 1),
                        protein=round(result.protein, 1),
                        fat=round(result.fat, 1),
                        carbs=round(result.carbs, 1),
                        weight_grams=round(result.weight_grams or 0.0, 1),
                        photo_path=None,
                        user_comment=transcription_text[:500] if transcription_text else None,
                        ingredients_json=(
                            json.dumps([i.model_dump() for i in result.ingredients], ensure_ascii=False)
                            if result.ingredients
                            else None
                        ),
                        ai_raw_response=result.raw_response,
                        is_manually_edited=False,
                        meal_date=today_date,
                        meal_time=curr_time,
                    )
                    db.add(meal)
                    await db.commit()
                    await db.refresh(meal)

                    summary_line = await self._get_daily_summary_line(db, user, today_date)
                    ing_lines = ""
                    if result.ingredients:
                        ing_str = ", ".join(f"{html.escape(i.name)} ({round(i.weight_grams)}г)" for i in result.ingredients)
                        ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                    safe_meal_name = html.escape(str(meal.name))
                    safe_transcript = html.escape(str(transcription_text))
                    reply_text = (
                        f"✅ <b>Добавлено из голосового сообщения:</b>\n"
                        f"🎤 Расшифровка: <i>«{safe_transcript}»</i>\n\n"
                        f"🍽 <b>{safe_meal_name}</b> ({round(meal.weight_grams or 0)} г)\n"
                        f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                        f"{ing_lines}\n"
                        f"<i>(Текст расшифровки сохранён в описание блюда на сайте)</i>\n\n"
                        f"{summary_line}"
                    )
                    await self.edit_message(
                        chat_id,
                        status_msg_id or 0,
                        reply_text,
                        reply_markup={
                            "inline_keyboard": [[{"text": "🗑 Удалить запись", "callback_data": f"del_meal:{meal.id}"}]]
                        },
                    )
                    return

                # =========================================================================
                # СЦЕНАРИЙ 3: Любое текстовое сообщение (не команда)
                # =========================================================================
                if text:
                    status_msg_id = await self.send_message(chat_id, "⏳ <i>Считаю КБЖУ по вашему описанию...</i>")
                    try:
                        result, prov_used, mod_used = await ai_router.recognize_food_by_text(
                            text=text,
                            custom_gemini_key=custom_gemini,
                            custom_openrouter_key=custom_openrouter,
                            custom_model_chain=custom_chain,
                        )
                    except Exception as e:
                        safe_err = html.escape(str(e))
                        await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка расчёта КБЖУ: {safe_err}")
                        return

                    meal = Meal(
                        user_id=user.id,
                        name=result.name,
                        calories=round(result.calories, 1),
                        protein=round(result.protein, 1),
                        fat=round(result.fat, 1),
                        carbs=round(result.carbs, 1),
                        weight_grams=round(result.weight_grams or 0.0, 1),
                        photo_path=None,
                        user_comment=text[:500],
                        ingredients_json=(
                            json.dumps([i.model_dump() for i in result.ingredients], ensure_ascii=False)
                            if result.ingredients
                            else None
                        ),
                        ai_raw_response=result.raw_response,
                        is_manually_edited=False,
                        meal_date=today_date,
                        meal_time=curr_time,
                    )
                    db.add(meal)
                    await db.commit()
                    await db.refresh(meal)

                    summary_line = await self._get_daily_summary_line(db, user, today_date)
                    ing_lines = ""
                    if result.ingredients:
                        ing_str = ", ".join(f"{html.escape(i.name)} ({round(i.weight_grams)}г)" for i in result.ingredients)
                        ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                    safe_meal_name = html.escape(str(meal.name))
                    safe_user_text = html.escape(text)
                    reply_text = (
                        f"✅ <b>Добавлено в дневник:</b>\n"
                        f"🍽 <b>{safe_meal_name}</b> ({round(meal.weight_grams or 0)} г)\n"
                        f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                        f"{ing_lines}\n"
                        f"💬 Описание: «{safe_user_text}»\n\n"
                        f"{summary_line}"
                    )
                    await self.edit_message(
                        chat_id,
                        status_msg_id or 0,
                        reply_text,
                        reply_markup={
                            "inline_keyboard": [[{"text": "🗑 Удалить запись", "callback_data": f"del_meal:{meal.id}"}]]
                        },
                    )

    async def send_shopping_list_message(self, chat_id: int, message_text: str) -> bool:
        """Export shopping list generated from MealPlanPage directly to user's Telegram."""
        msg_id = await self.send_message(chat_id, message_text)
        return msg_id is not None

    async def start_polling(self) -> None:
        """Background long-polling loop started inside FastAPI lifespan if TELEGRAM_BOT_TOKEN is set."""
        if not self.token:
            logger.info("TELEGRAM_BOT_TOKEN is not set; Telegram bot polling is disabled.")
            return

        self._running = True
        logger.info("Starting KaloriiAI Telegram Bot long-polling service...")

        while self._running:
            try:
                async with httpx.AsyncClient(timeout=35.0) as client:
                    resp = await client.get(
                        f"{self.base_url}/getUpdates",
                        params={"offset": self._offset, "timeout": 25},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for upd in data.get("result", []):
                            self._offset = max(self._offset, upd["update_id"] + 1)
                            task = asyncio.create_task(self.handle_update(upd))
                            self._tasks.add(task)
                            task.add_done_callback(self._tasks.discard)
                    elif resp.status_code in (401, 404):
                        logger.error("Invalid TELEGRAM_BOT_TOKEN; stopping Telegram polling.")
                        break
                    else:
                        await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"Telegram polling transient error: {e}")
                await asyncio.sleep(5)

    def stop(self) -> None:
        self._running = False
        for task in list(self._tasks):
            task.cancel()


telegram_bot_service = TelegramBotService()
