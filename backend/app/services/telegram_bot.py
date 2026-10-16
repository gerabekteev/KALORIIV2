import asyncio
import json
import logging
import uuid
from datetime import datetime, date as dt_date
from typing import Optional, Dict, Any
import httpx
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.meal import Meal
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.routers.ai import resolve_ai_config
from app.utils.image import process_image

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
            return f"📊 За сегодня: <b>{total_cal} / {goal} ккал</b> (осталось <b>{rem} ккал</b>)"
        return f"📊 За сегодня: <b>{total_cal} / {goal} ккал</b> (превышение на <b>{abs(rem)} ккал</b>)"

    async def _handle_link_code(
        self,
        db: AsyncSession,
        chat_id: int,
        username: Optional[str],
        code_raw: str,
    ) -> bool:
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

        await self.send_message(
            chat_id,
            f"✅ <b>Аккаунт успешно привязан к KaloriiAI!</b>\n"
            f"Профиль: <b>{user.name or user.email}</b> (цель: {user.daily_calories_goal} ккал/день).\n\n"
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
                            await db.delete(meal)
                            await db.commit()
                            summary_line = await self._get_daily_summary_line(db, user, dt_date.today())
                            await self.edit_message(
                                chat_id,
                                message_id,
                                f"🗑 Запись <b>«{meal_name}»</b> удалена из дневника.\n\n{summary_line}",
                            )
                return

            message = update.get("message")
            if not message:
                return

            chat = message.get("chat", {})
            chat_id = chat.get("id")
            if not chat_id:
                return

            from_user = message.get("from", {})
            username = from_user.get("username") or from_user.get("first_name")
            text = (message.get("text") or "").strip()

            # 2. Check /start command or direct KLR-XXXXXX link code
            if text.startswith("/start"):
                parts = text.split(maxsplit=1)
                if len(parts) == 2 and parts[1].strip():
                    await self._handle_link_code(db, chat_id, username, parts[1])
                    return
                await self.send_message(
                    chat_id,
                    "👋 Привет! Я бот <b>KaloriiAI</b>.\n\n"
                    "Чтобы привязать свой аккаунт, откройте раздел <b>Профиль → Telegram-бот</b> на сайте KaloriiAI, "
                    "нажмите «Подключить Telegram» и перейдите по ссылке (или отправьте мне код вида <code>KLR-123456</code>).",
                )
                return

            if text.upper().startswith("KLR-") and len(text) == 10:
                await self._handle_link_code(db, chat_id, username, text)
                return

            # 3. Find linked user
            u_res = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
            user = u_res.scalar_one_or_none()
            if not user:
                await self.send_message(
                    chat_id,
                    "🔒 Ваш Telegram ещё не привязан к аккаунту KaloriiAI.\n"
                    "Зайдите в <b>Профиль</b> на сайте, получите код привязки <code>KLR-XXXXXX</code> и отправьте его сюда.",
                )
                return

            if text == "/status" or text == "/today":
                summary_line = await self._get_daily_summary_line(db, user, dt_date.today())
                await self.send_message(chat_id, summary_line)
                return

            if text.startswith("/"):
                await self.send_message(
                    chat_id,
                    "Отправьте мне фото еды, голосовое сообщение или просто напишите текстом, что вы съели — я автоматически посчитаю КБЖУ и добавлю запись в ваш дневник!",
                )
                return

            # Resolve user's AI settings & model priority chain
            custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(current_user=user)
            now = datetime.now()
            today_date = now.date()
            curr_time = now.time().replace(microsecond=0)

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
                    compressed_bytes, _ = process_image(raw_bytes)
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
                        dest_path.unlink(missing_ok=True)
                    await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка распознавания AI: {e}")
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
                    ing_str = ", ".join(f"{i.name} ({round(i.weight_grams)}г)" for i in result.ingredients)
                    ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                reply_text = (
                    f"✅ <b>Добавлено в дневник по фото:</b>\n"
                    f"🍽 <b>{meal.name}</b> ({round(meal.weight_grams or 0)} г)\n"
                    f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                    f"{ing_lines}\n"
                    f"{f'💬 Описание: «{caption}»' + chr(10) if caption else ''}\n"
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
            # СЦЕНАРИЙ 2: Голосовое сообщение (voice / audio) -> Транскрибация в user_comment!
            # =========================================================================
            voice = message.get("voice") or message.get("audio")
            if voice:
                status_msg_id = await self.send_message(
                    chat_id, "🎤 <i>Слушаю голосовое сообщение, расшифровываю и считаю КБЖУ...</i>"
                )
                file_id = voice.get("file_id")
                mime_type = voice.get("mime_type") or "audio/ogg"

                audio_bytes = await self.download_telegram_file(file_id)
                if not audio_bytes:
                    await self.edit_message(chat_id, status_msg_id or 0, "❌ Не удалось скачать голосовое сообщение.")
                    return

                try:
                    result, prov_used, mod_used = await ai_router.recognize_food_by_voice(
                        audio_bytes=audio_bytes,
                        mime_type=mime_type,
                        custom_gemini_key=custom_gemini,
                        custom_openrouter_key=custom_openrouter,
                        custom_model_chain=custom_chain,
                    )
                except Exception as e:
                    await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка распознавания голоса: {e}")
                    return

                # ВАЖНО: Помещаем транскрибацию в user_comment, чтобы на сайте она отображалась
                # как описание блюда и её можно было свободно редактировать и переобрабатывать!
                transcription_text = (result.transcription or result.name).strip()

                meal = Meal(
                    user_id=user.id,
                    name=result.name,
                    calories=round(result.calories, 1),
                    protein=round(result.protein, 1),
                    fat=round(result.fat, 1),
                    carbs=round(result.carbs, 1),
                    weight_grams=round(result.weight_grams or 0.0, 1),
                    photo_path=None,
                    user_comment=transcription_text[:500],
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
                    ing_str = ", ".join(f"{i.name} ({round(i.weight_grams)}г)" for i in result.ingredients)
                    ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                reply_text = (
                    f"✅ <b>Добавлено из голосового сообщения:</b>\n"
                    f"🎤 Расшифровка: <i>«{transcription_text}»</i>\n\n"
                    f"🍽 <b>{meal.name}</b> ({round(meal.weight_grams or 0)} г)\n"
                    f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                    f"{ing_lines}\n"
                    f"<i>(Текст расшифровки сохранён в описание блюда на сайте — вы можете отредактировать его и пересчитать в любой момент)</i>\n\n"
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
                    await self.edit_message(chat_id, status_msg_id or 0, f"❌ Ошибка расчёта КБЖУ: {e}")
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
                    ing_str = ", ".join(f"{i.name} ({round(i.weight_grams)}г)" for i in result.ingredients)
                    ing_lines = f"\n🥗 Состав: <i>{ing_str}</i>"

                reply_text = (
                    f"✅ <b>Добавлено в дневник:</b>\n"
                    f"🍽 <b>{meal.name}</b> ({round(meal.weight_grams or 0)} г)\n"
                    f"🔥 <b>{round(meal.calories)} ккал</b> • Б: {meal.protein}г | Ж: {meal.fat}г | У: {meal.carbs}г"
                    f"{ing_lines}\n\n"
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
                            asyncio.create_task(self.handle_update(upd))
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


telegram_bot_service = TelegramBotService()
