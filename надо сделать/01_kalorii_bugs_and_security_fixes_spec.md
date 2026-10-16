# Техническое задание для ИИ-агента (Часть 1): Устранение всех уязвимостей безопасности, серверных ошибок и фронтенд-багов в KaloriiAI (kaloriiv2)

Данный документ является прямым руководством к действию для ИИ-агента разработчика. В нём описаны **29 актуальных проблем** (10 уязвимостей безопасности, 8 серверных багов и 11 клиентских/визуальных ошибок), присутствующих в текущей ревизии репозитория **KaloriiAI (`kaloriiv2`)** после миграции `0004_add_meal_ingredients`.

Для каждой задачи ниже указаны:
1. Точный путь к файлу и номера строк.
2. Причина возникновения уязвимости или бага.
3. **Готовый код исправления**, который необходимо внести в соответствующие файлы.

## Архитектурные правила при внесении правок

* **Бэкенд**: Python 3.12, FastAPI, SQLAlchemy 2.0 (`AsyncSession` + `aiosqlite`), Alembic, Pydantic v2, `httpx`, `Pillow`. Весь код находится в `backend/app/`.
* **Фронтенд**: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand, Recharts, Lucide Icons. Весь код находится в `frontend/src/`.
* **Сборка статики**: После внесения всех правок на фронтенде обязательно выполни `cd frontend && npm run build`, очисти старые ассеты в `backend/static/assets/` и скопируй свежий бандл из `frontend/dist/*` в `backend/static/`.

## Сводный реестр задач (Часть 1)

| ID задачи | Категория | Приоритет | Файлы | Краткое описание исправления |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Безопасность | Критический | `backend/app/main.py` | Закрытие Path Traversal в `serve_spa` через `.resolve()` и `is_relative_to()` |
| **SEC-02** | Безопасность | Критический | `backend/app/routers/meals.py`, `schemas/meal.py` | Закрытие Path Traversal при чтении `photo_path` в `recalculate_meal` и валидация пути |
| **SEC-03** | Безопасность | Высокий | `backend/app/config.py`, `docs/DEPLOYMENT.md` | Защита от запуска в продакшене с предсказуемым дефолтным `JWT_SECRET` |
| **SEC-04** | Безопасность | Высокий | `backend/app/routers/barcode.py`, `models/scanned_product.py` | Изоляция пользовательских фото из `scan-image` (запрет записи личных скриншотов в глобальный `Product.image_url`) |
| **SEC-05** | Безопасность | Высокий | `backend/app/routers/auth.py`, `schemas/user.py` | Добавление Rate Limiting на `/api/auth/login`, `/register`, `/refresh` и усиление валидации пароля |
| **SEC-06** | Безопасность | Высокий | `backend/app/utils/image.py` | Защита от Decompression Bomb (Pixel Flood / OOM) через `Image.MAX_IMAGE_PIXELS` |
| **SEC-07** | Безопасность | Высокий | `backend/app/routers/profile.py`, `AISettingsCard.tsx`, `authStore.ts` | Маскирование API-ключей при отдаче, шифрование в БД и очистка `kalorii_ai_settings` при `logout()` |
| **SEC-08** | Безопасность | Средний | `backend/app/routers/ai.py`, `services/ai_router.py` | Белый список (allowlist) моделей при использовании системного ключа и валидация `model_id` |
| **SEC-09** | Безопасность | Средний | `backend/app/utils/ai_providers/gemini.py`, `base.py`, `routers/ai.py` | Передача ключа Gemini в заголовке `x-goog-api-key` вместо URL и скрытие сырых ошибок БД от клиента |
| **SEC-10** | Безопасность | Средний | `backend/app/services/barcode_service.py`, `Dockerfile`, `deploy/Caddyfile.kalorii` | Защита глобальных товаров от перезаписи чужими данными, непривилегированный пользователь в Docker и Security Headers |
| **BUG-B01** | Бэкенд | Высокий | `backend/app/routers/barcode.py` | Удаление лишнего файла с диска в `scan_barcode_image_endpoint`, если у найденного товара уже есть фото |
| **BUG-B02** | Бэкенд | Высокий | `backend/app/main.py`, `services/barcode_service.py` | Уникальный индекс на штрихкод для глобальных продуктов и защита от гонки (`IntegrityError`) |
| **BUG-B03** | Бэкенд | Средний | `backend/app/routers/meals.py`, `profile.py`, `stats.py`, `frontend/src/api/client.ts` | Учёт локальной даты клиента через заголовок `X-Client-Date` вместо серверного `date.today()` (UTC) |
| **BUG-B04** | Бэкенд | Средний | `backend/app/routers/stats.py` | Исправление расчёта `goal_met_percentage` (деление на `tracked_days` вместо календарных `total_days`) |
| **BUG-B05** | Бэкенд | Средний | `backend/app/services/auth.py` | Безопасное предварительное SHA-256 хэширование пароля перед `bcrypt` без разрезания кириллицы UTF-8 |
| **BUG-B06** | Бэкенд | Средний | `backend/app/main.py` | Периодическая фоновая задача очистки сиротских файлов `cleanup_orphan_uploads` каждые 12 часов |
| **BUG-B07** | Бэкенд | Низкий | `backend/app/routers/stats.py` | Ограничение максимального диапазона дат в `GET /api/stats?period=custom` (максимум 366 дней) |
| **BUG-B08** | Бэкенд | Низкий | `backend/app/schemas/meal.py`, `product.py`, `ai.py` | Добавление верхних границ `le=...` для калорий, БЖУ и веса порции |
| **BUG-F01** | Фронтенд | Высокий | `frontend/src/store/mealsStore.ts` | Исправление сдвига даты на 2 дня назад в `getPreviousDayString` в западных часовых поясах |
| **BUG-F02** | Фронтенд | Средний | `ProfilePage.tsx`, `StatsPage.tsx`, `ProgressRings.tsx` | Приведение всех фолбэков дневных норм КБЖУ к единому стандарту `2000 / 140 / 70 / 250` |
| **BUG-F03** | Фронтенд | Средний | `MealCard.tsx`, `TodayPage.tsx`, `mealsStore.ts` | Сохранение времени приёма пищи при повторе вчерашнего завтрака и копирование в `selectedDate` |
| **BUG-F04** | Фронтенд | Средний | `frontend/src/store/mealsStore.ts` | Защита `deleteMealWithUndo` от потери удаления при смене даты или закрытии вкладки |
| **BUG-F05** | Фронтенд | Низкий | `Layout.tsx`, `uiStore.ts`, `AIResultModal.tsx` | Удаление мёртвого вызова `AIResultModal` из `Layout.tsx` (или передача `ingredients`) |
| **BUG-F06** | Фронтенд | Средний | `frontend/src/api/recipes.ts`, `backend/app/schemas/recipe.py`, `routers/recipes.py` | Сохранение состава ингредиентов (`meal.ingredients`) при сохранении блюда из дневника в «Мои рецепты» |
| **BUG-F07** | Фронтенд | Средний | `EditMealModal.tsx`, `ProductSearch.tsx`, `RecipeList.tsx` | Добавление поля даты блюда в `EditMealModal`, кнопки создания своего продукта в `ProductSearch` и редактирования рецепта |
| **BUG-F08** | Фронтенд | Средний | `AddMealModal.tsx`, `BarcodeScannerView.tsx` | Исключение перехвата `Ctrl+V` (`paste`), когда фокус находится в `input`/`textarea`, и устранение дублирования слушателей |
| **BUG-F09** | Фронтенд | Низкий | `PeriodSelector.tsx`, `StatsPage.tsx`, `useStats.ts` | Добавление вкладки «Год (365 дн.)» и выбора произвольного периода в `PeriodSelector.tsx` |
| **BUG-F10** | Фронтенд | Средний | `mealsStore.ts`, `useStats.ts`, `package.json` | Защита от Race Condition при быстром переключении дат/периодов с помощью счётчика запросов |
| **BUG-F11** | PWA / Статика | Средний | `frontend/public/sw.js`, `backend/static/assets/` | Fallback на `/index.html` для навигационных запросов в `sw.js` и очистка дублей старых бандлов |

---

## Раздел 1. Исправление уязвимостей безопасности (SEC-01 .. SEC-10)

### SEC-01 и BUG-B06. Закрытие Path Traversal при раздаче статики SPA и периодическая очистка сиротских файлов в `backend/app/main.py`

* **Файл**: `backend/app/main.py` (строки 25–70 и 110–130).
* **Проблема**:
  1. В `serve_spa(full_path: str)` вычисляется `file_path = STATIC_DIR / full_path` без `.resolve()` и без проверки `file_path.is_relative_to(STATIC_DIR.resolve())`. При передаче закодированных сегментов `..` возможен выход из `STATIC_DIR` и чтение `db.sqlite3` или `.env`.
  2. Функция `cleanup_orphan_uploads` вызывается только один раз при старте сервера, а при многомесячной работе контейнера больше никогда не запускается.
* **Исправление**:
  В `backend/app/main.py`:
  1. Добавь фоновый таск `_periodic_orphan_cleanup()`, который запускается в `lifespan` через `asyncio.create_task` и раз в 12 часов очищает неиспользуемые файлы старше 24 часов.
  2. В `serve_spa` используй строгую проверку `is_relative_to`:

```python
# В начале backend/app/main.py добавь import asyncio:
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from sqlalchemy import text
from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.routers import auth, meals, products, recipes, stats, profile, ai, barcode
from app.utils.image import cleanup_orphan_uploads
from scripts.seed_products import seed_products

logger = logging.getLogger("kalorii.main")


async def _periodic_orphan_cleanup() -> None:
    """Background task that cleans up orphan uploaded files every 12 hours."""
    while True:
        await asyncio.sleep(12 * 3600)
        try:
            async with AsyncSessionLocal() as session:
                cleaned = await cleanup_orphan_uploads(session, max_age_hours=24)
                if cleaned > 0:
                    logger.info(f"Periodic cleanup removed {cleaned} orphan upload files.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Error in periodic orphan cleanup: {e}")
```

Внутри `lifespan(app: FastAPI)` перед `yield` запусти фоновую задачу и отмени её при остановке, а также добавь уникальный индекс для глобальных штрихкодов (см. **BUG-B02**):

```python
    cleanup_task = asyncio.create_task(_periodic_orphan_cleanup())
    logger.info("KaloriiAI backend ready.")
    try:
        yield
    finally:
        cleanup_task.cancel()
        logger.info("Shutting down KaloriiAI application...")
        await engine.dispose()
```

А функцию `serve_spa` в `backend/app/main.py` замени на безопасную реализацию:

```python
if STATIC_DIR.exists():
    STATIC_ROOT = STATIC_DIR.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Allow API, docs, and uploads to pass through or 404
        normalized = full_path.lstrip("/\\")
        if normalized.startswith(("api", "uploads", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")

        try:
            file_path = (STATIC_ROOT / normalized).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        # Strict Path Traversal protection
        if not file_path.is_relative_to(STATIC_ROOT):
            raise HTTPException(status_code=403, detail="Forbidden")

        if file_path.is_file():
            return FileResponse(file_path)

        index_file = STATIC_ROOT / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
```

---

### SEC-02 и BUG-B08. Закрытие Path Traversal в `recalculate_meal` и валидация верхних границ в `schemas/meal.py` и `routers/meals.py`

* **Файлы**: `backend/app/schemas/meal.py` и `backend/app/routers/meals.py` (строки 248–258).
* **Проблема**:
  1. В `recalculate_meal` (`backend/app/routers/meals.py`) строка `filename = meal.photo_path.replace("/uploads/", "").lstrip("/\\")` не защищает от `../` внутри пути (`photo_path = "../data/db.sqlite3"`), позволяя прочитать любой локальный файл сервера в `photo_bytes` и отправить его во внешний AI.
  2. В `MealCreate` и `MealUpdate` (`backend/app/schemas/meal.py`) отсутствуют верхние границы (`le`) для числовых полей и валидация `photo_path`.
* **Исправление**:
  1. В `backend/app/schemas/meal.py` добавь проверку `photo_path` и разумные верхние пределы (`le=50000` для калорий, `le=10000` для БЖУ и `le=25000` для граммов):

```python
import re
from datetime import datetime, date, time
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.schemas.ai import MealIngredientItem


def _validate_safe_photo_path(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    val = v.strip()
    if not val:
        return None
    if val.startswith(("http://", "https://")):
        return val
    # Разрешаем только безопасное имя файла внутри /uploads/ без .. и слэшей
    clean_name = val.replace("/uploads/", "").replace("uploads/", "").lstrip("/")
    if ".." in clean_name or "/" in clean_name or "\\" in clean_name:
        raise ValueError("Недопустимый путь к файлу изображения")
    if not re.match(r"^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$", clean_name, re.IGNORECASE):
        raise ValueError("Недопустимый формат имени файла изображения")
    return f"/uploads/{clean_name}"


class MealCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    calories: float = Field(..., ge=0, le=50000)
    protein: float = Field(..., ge=0, le=10000)
    fat: float = Field(..., ge=0, le=10000)
    carbs: float = Field(..., ge=0, le=10000)
    weight_grams: Optional[float] = Field(0.0, ge=0, le=25000)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=1000)
    ai_raw_response: Optional[str] = None
    is_manually_edited: bool = False
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)

    _check_photo = field_validator("photo_path")(classmethod(lambda cls, v: _validate_safe_photo_path(v)))


class MealUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    calories: Optional[float] = Field(None, ge=0, le=50000)
    protein: Optional[float] = Field(None, ge=0, le=10000)
    fat: Optional[float] = Field(None, ge=0, le=10000)
    carbs: Optional[float] = Field(None, ge=0, le=10000)
    weight_grams: Optional[float] = Field(None, ge=0, le=25000)
    photo_path: Optional[str] = Field(None, max_length=500)
    user_comment: Optional[str] = Field(None, max_length=1000)
    is_manually_edited: Optional[bool] = True
    meal_date: Optional[date] = None
    meal_time: Optional[time] = None
    ingredients: Optional[List[MealIngredientItem]] = None

    _check_photo = field_validator("photo_path")(classmethod(lambda cls, v: _validate_safe_photo_path(v)))
```

  2. В `backend/app/routers/meals.py` в функции `recalculate_meal` (строки 248–258) замени чтение файла на безопасное:

```python
    # 5. Check if meal has a stored photo (with strict Path Traversal protection)
    photo_bytes = None
    if meal.photo_path and not meal.photo_path.startswith(("http://", "https://")):
        safe_name = Path(meal.photo_path).name
        upload_root = settings.UPLOAD_DIR.resolve()
        photo_file = (upload_root / safe_name).resolve()
        if photo_file.parent == upload_root and photo_file.is_file():
            try:
                photo_bytes = photo_file.read_bytes()
            except Exception:
                photo_bytes = None
```

  Также в `backend/app/routers/meals.py` во всех блоках `except Exception as e:` (в `create_meal`, `update_meal`, `delete_meal`, `recalculate_meal`, `copy_meal`) убери вывод `{e}` в `detail`, заменив на безопасное сообщение, а саму ошибку логируй через `logger.error(...)`.

---

### SEC-03. Защита `JWT_SECRET` в `backend/app/config.py` и `docs/DEPLOYMENT.md`

* **Файлы**: `backend/app/config.py` (строки 26–32) и `docs/DEPLOYMENT.md` (строка 67).
* **Проблема**: Статический секрет по умолчанию зашит в коде и в документации `DEPLOYMENT.md`.
* **Исправление**:
  1. В `backend/app/config.py` добавь предупреждение/генерацию криптостойкого ключа или проверку при `DEBUG=False`, чтобы известные публичные строки из документации никогда не использовались для подписи токенов в продакшене:

```python
import secrets
import logging

_INSECURE_DEFAULT_SECRETS = {
    "kaloriiai_super_secure_jwt_secret_change_in_production_2026",
    "super_secure_jwt_secret_kalorii_production_2026",
    "replace_with_a_super_secret_jwt_key_at_least_32_characters_long",
    "changeme",
    "secret",
}
```

И внутри класса `Settings` в `backend/app/config.py` добавь валидатор `JWT_SECRET`:

```python
    @field_validator("JWT_SECRET", mode="after")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 32:
            logging.getLogger("kalorii.config").warning(
                "JWT_SECRET короче 32 символов! Настоятельно рекомендуется задать криптостойкий ключ (openssl rand -hex 32)."
            )
        if clean in _INSECURE_DEFAULT_SECRETS:
            logging.getLogger("kalorii.config").warning(
                "ВНИМАНИЕ: Используется публично известный дефолтный JWT_SECRET! Замените JWT_SECRET в файле .env на уникальный ключ."
            )
        return clean
```

  2. В `docs/DEPLOYMENT.md` (строка 67) замени `JWT_SECRET=super_secure_jwt_secret_kalorii_production_2026` на `JWT_SECRET=$(openssl rand -hex 32)`.

---

### SEC-04, SEC-10 и BUG-B01. Изоляция пользовательских фото и защита глобальных товаров в `barcode.py` и `barcode_service.py`

* **Файлы**: `backend/app/routers/barcode.py` (строки 155–205) и `backend/app/services/barcode_service.py` (строки 318–375).
* **Проблема**:
  1. В `scan_barcode_image_endpoint` (`routers/barcode.py`):
     - Если товар по распознанному штрихкоду уже существует (`existing_prod`) и у него уже есть `existing_prod.image_url`, загруженный файл `dest_path` **не удаляется с диска** (BUG-B01).
     - Если создаётся новый продукт из фотографии пользователя, он создаётся как глобальный (`is_custom=False`) с личным фото пользователя из `/uploads/`, из-за чего личные скриншоты заказов и чеков становятся видны другим пользователям (SEC-04).
  2. В `update_barcode_product` (`services/barcode_service.py`) любой пользователь может перезаписать глобальный товар из Open Food Facts для всех остальных пользователей (SEC-10).
* **Исправление**:
  1. В `backend/app/routers/barcode.py` в `scan_barcode_image_endpoint` (строки 160–195) удаляй дубликат файла, если у продукта уже есть картинка, а если продукт создаётся по фото пользователя без штрихкода — помечай его как персональный (`is_custom=True, created_by_user_id=current_user.id`):

```python
        # Check if product already exists by detected_code to avoid duplicates
        existing_prod = None
        if detected_code:
            stmt = select(Product).where(
                and_(
                    Product.barcode == detected_code,
                    or_(Product.is_custom.is_(False), Product.created_by_user_id == current_user.id),
                )
            ).limit(1)
            res = await db.execute(stmt)
            existing_prod = res.scalar_one_or_none()

        if existing_prod:
            if not existing_prod.image_url:
                existing_prod.image_url = relative_url_path
                await db.commit()
                await db.refresh(existing_prod)
            else:
                # Удаляем лишний загруженный файл, так как у товара уже есть фото (BUG-B01)
                if dest_path.exists():
                    try:
                        dest_path.unlink()
                    except Exception:
                        pass
            target_prod = existing_prod
        else:
            # Если штрихкод не обнаружен на скриншоте, создаём как приватный продукт пользователя (SEC-04)
            is_private_scan = detected_code is None
            new_prod = Product(
                name=name,
                barcode=detected_code,
                calories_per_100g=round(float(analysis_result.calories or 0), 1),
                protein_per_100g=round(float(analysis_result.protein or 0), 1),
                fat_per_100g=round(float(analysis_result.fat or 0), 1),
                carbs_per_100g=round(float(analysis_result.carbs or 0), 1),
                package_weight_grams=grams,
                image_url=relative_url_path,
                category="Скан",
                is_custom=is_private_scan,
                created_by_user_id=current_user.id,
            )
            db.add(new_prod)
            await db.commit()
            await db.refresh(new_prod)
            target_prod = new_prod
```

  2. В `backend/app/services/barcode_service.py` в `update_barcode_product` (строки 340–365) добавь валидацию `image_url` (разрешать только локальные `/uploads/...` или `https://images.openfoodfacts.org/...`, исключая сторонние трекеры):

```python
    if image_url is not None:
        clean_img = image_url.strip()
        if clean_img and not (
            clean_img.startswith("/uploads/")
            or clean_img.startswith("https://images.openfoodfacts.org/")
            or clean_img.startswith("https://static.openfoodfacts.org/")
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недопустимый источник изображения продукта",
            )
        product.image_url = clean_img if clean_img else None
```

---

### SEC-05 и BUG-B05. Rate Limiting на эндпоинтах авторизации и безопасное хэширование кириллических паролей в `auth.py`

* **Файлы**: `backend/app/services/auth.py` (строки 16–32) и `backend/app/routers/auth.py`.
* **Проблема**:
  1. На `/api/auth/login`, `/api/auth/register` и `/api/auth/refresh` нет защиты от брутфорса.
  2. В `hash_password` и `verify_password` (`services/auth.py`) используется `password.encode("utf-8")[:72]`, который обрезает русские пароли на 36-м символе и может разрезать многобайтовый UTF-8 символ пополам, вызывая ошибку декодирования или молчаливое отбрасывание хвоста пароля.
* **Исправление**:
  1. В `backend/app/services/auth.py` сохрани обратную совместимость со старыми хэшами в БД, но для паролей длиннее 72 байт используй предварительное SHA-256 хэширование (`hashlib.sha256`), чтобы ни один символ никогда не терялся и не разрезался:

```python
import hashlib


def _prepare_password_bytes(password: str) -> bytes:
    """Safely prepare password bytes for bcrypt (handles >72 UTF-8 bytes without mid-character slicing)."""
    raw_bytes = password.encode("utf-8")
    if len(raw_bytes) <= 72:
        return raw_bytes
    return hashlib.sha256(raw_bytes).hexdigest().encode("ascii")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with standard rounds."""
    password_bytes = _prepare_password_bytes(password)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash (with legacy [:72] fallback)."""
    try:
        hash_bytes = hashed_password.encode("utf-8")
        prepared = _prepare_password_bytes(plain_password)
        if bcrypt.checkpw(prepared, hash_bytes):
            return True
        # Fallback for legacy passwords that were truncated with [:72]
        legacy_bytes = plain_password.encode("utf-8")[:72]
        if legacy_bytes != prepared:
            return bcrypt.checkpw(legacy_bytes, hash_bytes)
        return False
    except Exception:
        return False
```

  2. В `backend/app/routers/auth.py` добавь in-memory sliding-window ограничитель частоты попыток входа и регистрации по IP-адресу клиента:

```python
import time
from collections import defaultdict, deque
from fastapi import APIRouter, Depends, HTTPException, Request, status

_auth_rate_records: dict[str, deque] = defaultdict(deque)


def check_auth_rate_limit(request: Request, max_attempts: int = 10, window_seconds: float = 60.0) -> None:
    """Protect auth endpoints from brute-force attacks per client IP."""
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
```

И вызывай `check_auth_rate_limit(request, max_attempts=10)` в начале `register`, `login` и `refresh_token` в `backend/app/routers/auth.py` (добавив параметр `request: Request` в сигнатуры этих трёх эндпоинтов).

---

### SEC-06. Защита от Decompression Bomb (Pixel Flood) в `backend/app/utils/image.py`

* **Файл**: `backend/app/utils/image.py` (строки 1–35).
* **Проблема**: Отсутствует ограничение `Image.MAX_IMAGE_PIXELS` перед распаковкой растрового изображения в память.
* **Исправление**:
  В `backend/app/utils/image.py` задай жёсткий лимит в 25 мегапикселей (`25_000_000`) и проверяй размеры изображения сразу после `Image.open`:

```python
from PIL import Image, ImageOps

# Защита от Decompression Bomb (максимум 25 МП, т.е. ~5000x5000px)
Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_DIMENSION_HARD_LIMIT = 8000
```

А внутри `process_image(image_bytes: bytes)` сразу после `image = Image.open(io.BytesIO(image_bytes))` добавь:

```python
    if image.width > MAX_DIMENSION_HARD_LIMIT or image.height > MAX_DIMENSION_HARD_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Разрешение изображения слишком велико ({image.width}x{image.height}). Максимум {MAX_DIMENSION_HARD_LIMIT}px.",
        )
```

---

### SEC-07. Безопасная работа с пользовательскими API-ключами и очистка `localStorage` при выходе (`authStore.ts`, `AISettingsCard.tsx`, `profile.py`)

* **Файлы**: `frontend/src/store/authStore.ts` (строки 81–91), `frontend/src/components/settings/AISettingsCard.tsx`, `backend/app/routers/profile.py` (строки 209–285).
* **Проблема**:
  1. При выходе из аккаунта (`authStore.logout()`) в `localStorage` остаются `kalorii_ai_settings` (с чужими API-ключами Gemini и OpenRouter) и кэш планов питания.
  2. Если пользователь ввёл замаскированный ключ или случайно сохранил его повторно, ключ может перезаписаться.
* **Исправление**:
  1. В `frontend/src/store/authStore.ts` в методе `logout` и в блоке `catch` метода `checkAuth` обязательно очищай `kalorii_ai_settings`:

```ts
  logout: () => {
    localStorage.removeItem('kalorii_token')
    localStorage.removeItem('kalorii_refresh_token')
    localStorage.removeItem('kalorii_ai_settings')
    localStorage.removeItem('kalorii_meal_plans_cache')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
  },
```

---

### SEC-08 и SEC-09. Защита `model_id`, передача ключа Gemini в заголовке `x-goog-api-key` и защита от утечки ключей в логах (`ai.py`, `gemini.py`)

* **Файлы**: `backend/app/utils/ai_providers/gemini.py` (строки 25–65) и `backend/app/routers/ai.py` (строки 67–135).
* **Проблема**:
  1. В `GeminiProvider._send_and_parse` ключ передаётся в URL `?key={self.api_key}`, из-за чего при любом сетевом сбое `httpx.RequestError` включает полный URL вместе с секретным ключом в текст исключения и логи.
  2. В `_parse_custom_ai_models` (`routers/ai.py`) не проверяется формат `mod_id` (возможна инъекция символов `..`, `/`, `?` в путь URL) и не блокируется вызов дорогих коммерческих моделей OpenRouter при отсутствии собственного ключа пользователя.
* **Исправление**:
  1. В `backend/app/utils/ai_providers/gemini.py` передавай API-ключ через HTTP-заголовок `x-goog-api-key` и валидируй `self.model_id`:

```python
    async def _send_and_parse(self, payload: dict) -> FoodAnalysisResult:
        import re
        from app.config import settings

        if not re.match(r"^[a-zA-Z0-9._-]+$", self.model_id):
            raise AIProviderError(f"Invalid Gemini model ID format: {self.model_id}")

        base_url = (settings.GEMINI_BASE_URL or GEMINI_BASE_URL).rstrip("/")
        url = f"{base_url}/{self.model_id}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        proxy = settings.GEMINI_PROXY_URL.strip() if settings.GEMINI_PROXY_URL else None

        client_kwargs = {"timeout": 45.0}
        if proxy:
            client_kwargs["proxy"] = proxy

        async with httpx.AsyncClient(**client_kwargs) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException:
                raise AIProviderError(f"Gemini ({self.model_id}) timeout exceeded")
            except httpx.RequestError as e:
                raise AIProviderError(f"Gemini ({self.model_id}) network connection error: {type(e).__name__}")
```
  *(Не забудь также передать `headers=headers` во втором вызове `await client.post(url, headers=headers, json=payload_retry)` на строке 59 в `gemini.py`!)*

  2. В `backend/app/routers/ai.py` в `_parse_custom_ai_models` и `resolve_ai_config` добавь проверку формата `mod_id` и фильтр: если у пользователя **не задан** свой `resolved_openrouter` ключ, разрешай для провайдера `openrouter` только модели из `MODEL_METADATA_CATALOG` или заканчивающиеся на `:free` / `openrouter/auto`, чтобы исключить растрату системного баланса OpenRouter на коммерческие модели:

```python
import re
from app.services.ai_router import MODEL_METADATA_CATALOG

_SAFE_MODEL_ID_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")


def _is_allowed_model(provider: str, model_id: str, has_custom_key: bool) -> bool:
    if not _SAFE_MODEL_ID_RE.match(model_id) or ".." in model_id:
        return False
    if has_custom_key:
        return True
    # При использовании системного ключа сервера разрешаем только модели из каталога или бесплатные модели
    if model_id in MODEL_METADATA_CATALOG:
        return True
    if provider == "openrouter" and (model_id.endswith(":free") or model_id == "openrouter/auto"):
        return True
    if provider == "gemini" and model_id.startswith("gemini-"):
        return True
    return False
```

И в конце `resolve_ai_config` в `backend/app/routers/ai.py` отфильтруй `custom_chain`:

```python
    if custom_chain is not None:
        custom_chain = [
            (prov, mod_id)
            for prov, mod_id in custom_chain
            if _is_allowed_model(
                prov,
                mod_id,
                has_custom_key=bool(resolved_gemini if prov == "gemini" else resolved_openrouter),
            )
        ]
```

---

### SEC-10 (Инфраструктура). Непривилегированный пользователь в `Dockerfile` и заголовки безопасности в `deploy/Caddyfile.kalorii`

* **Файлы**: `Dockerfile` и `deploy/Caddyfile.kalorii`.
* **Исправление**:
  1. В `Dockerfile` добавь создание системного пользователя `kalorii` перед `ENTRYPOINT`:

```dockerfile
# Create non-root user and set ownership
RUN useradd -m -u 1000 kalorii && \
    chmod +x /app/backend/entrypoint.sh && \
    mkdir -p /app/backend/data /app/backend/uploads && \
    chown -R kalorii:kalorii /app/backend

USER kalorii
WORKDIR /app/backend
```

  2. В `deploy/Caddyfile.kalorii` добавь стандартные заголовки защиты:

```caddyfile
kalorii.lopni.fun {
    encode zstd gzip

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    reverse_proxy kalorii:5100 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

---

## Раздел 2. Исправление серверных багов бэкенда (BUG-B02, BUG-B03, BUG-B04, BUG-B07)

### BUG-B02. Частичный уникальный индекс для глобальных штрихкодов и защита от гонки

* **Файлы**: `backend/app/main.py` (в `lifespan`) и `backend/app/services/barcode_service.py` (строки 235–265).
* **Проблема**: Два параллельных скана одного и того же нового штрихкода создают два дубликата `Product` с одинаковым `barcode`.
* **Исправление**:
  В `backend/app/main.py` в список SQL-команд внутри `lifespan` добавь:
  ```python
  "CREATE UNIQUE INDEX IF NOT EXISTS ix_products_global_barcode_uniq ON products (barcode) WHERE is_custom = 0 AND barcode IS NOT NULL",
  ```

---

### BUG-B03. Передача локальной даты клиента (`X-Client-Date`) для устранения расхождения часовых поясов с UTC

* **Файлы**: `frontend/src/api/client.ts`, `backend/app/routers/meals.py`, `backend/app/routers/profile.py`, `backend/app/routers/stats.py`.
* **Проблема**: На сервере в Docker `date.today()` возвращает дату по UTC. У пользователей из РФ (UTC+3..UTC+10) в ночные и утренние часы сервер считает, что ещё вчерашний день.
* **Исправление**:
  1. В `frontend/src/api/client.ts` автоматически добавляй заголовок `X-Client-Date` с локальной датой устройства `YYYY-MM-DD` ко всем запросам:

```ts
  const now = new Date()
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (!headers['X-Client-Date']) {
    headers['X-Client-Date'] = localDateStr
  }
```

  2. В `backend/app/routers/stats.py` в `get_stats` принимай заголовок `x_client_date: Optional[date] = Header(None, alias="X-Client-Date")` и используй `today = x_client_date or date.today()`.

---

### BUG-B04 и BUG-B07. Исправление формулы `goal_met_percentage` и лимит на длину периода в `backend/app/routers/stats.py`

* **Файл**: `backend/app/routers/stats.py` (строки 41–55 и 115–140).
* **Проблема**:
  1. В `get_stats` при `period == "custom"` нет ограничения на `(end_date - start_date).days`, что позволяет запросить 100 лет одним запросом.
  2. Процент выполнения цели `goal_met_percentage` делится на `total_days` (все календарные дни периода, включая пустые дни до начала ведения дневника), тогда как средние калории делятся на `tracked_days`.
* **Исправление**:
  В `backend/app/routers/stats.py`:
  1. В блоке `elif period == "custom":` после проверки `if start_date > end_date:` добавь:
     ```python
     if (end_date - start_date).days > 366:
         raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST,
             detail="Максимальная длительность произвольного периода — 366 дней",
         )
     ```
  2. На строке 135 замени расчёт `goal_met_percentage` так, чтобы он считался относительно заполненных дней `tracked_days` (полностью согласованно со средними калориями и фронтендом):
     ```python
     goal_met_percentage = (
         round((goal_met_days / tracked_days) * 100, 1) if tracked_days > 0 else 0.0
     )
     ```

---

## Раздел 3. Исправление визуальных, версточных и клиентских багов (BUG-F01 .. BUG-F11)

### BUG-F01, BUG-F03, BUG-F04 и BUG-F10. Исправления в `frontend/src/store/mealsStore.ts`

* **Файл**: `frontend/src/store/mealsStore.ts`.
* **Проблемы**:
  1. **BUG-F01**: В `getPreviousDayString(dateStr)` вызов `new Date(dateStr)` парсит строку `'YYYY-MM-DD'` как полночь UTC, что в западных часовых поясах сразу откатывает дату на вчерашний вечер, а `d.setDate(d.getDate() - 1)` возвращает позавчерашний день (сдвиг на -2 дня).
  2. **BUG-F03**: В `copyMultipleMealsToDate` не сохраняется исходное время приёма пищи (`meal_time`), поэтому при повторе «Вчерашнего завтрака» вечером все утренние блюда получают вечернее время UTC.
  3. **BUG-F04**: При вызове `deleteMealWithUndo` и быстром переключении даты `fetchMeals` возвращает с сервера блюдо, которое ещё ждёт 5-секундного таймера удаления, а при закрытии вкладки таймер теряется.
  4. **BUG-F10**: При быстром переключении дней в календаре ответы `fetchMeals` могут прийти не по порядку (Race Condition).
* **Исправление**:
  В `frontend/src/store/mealsStore.ts`:
  1. Замени `getPreviousDayString` на локальный парсинг компонентов даты:

```ts
export function getPreviousDayString(dateStr: string): string {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3) return dateStr
  const d = new Date(parts[0], parts[1] - 1, parts[2] - 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

  2. Добавь счётчик запросов `let latestFetchRequestId = 0` и фильтрацию `pendingDeletes` внутри `fetchMeals`:

```ts
let latestFetchRequestId = 0

// Flush pending deletes immediately if user closes or reloads the tab (BUG-F04)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [mealId, timer] of pendingDeletes.entries()) {
      clearTimeout(timer)
      pendingDeletes.delete(mealId)
      const token = localStorage.getItem('kalorii_token')
      fetch(`/api/meals/${mealId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        keepalive: true,
      }).catch(() => {})
    }
  })
}
```

  3. В `fetchMeals` проверяй `requestId === latestFetchRequestId` и исключай блюда, находящиеся в `pendingDeletes`:

```ts
  fetchMeals: async (date?: string) => {
    const targetDate = date || get().selectedDate
    const requestId = ++latestFetchRequestId
    set({ isLoading: true, error: null })
    try {
      const data = await mealsApi.getMeals(targetDate)
      if (requestId !== latestFetchRequestId) return
      const rawList = Array.isArray(data) ? data : (data?.meals || [])
      // Не показываем блюда, которые ожидают завершения 5-сек таймера удаления
      const filteredList = rawList.filter((m) => !pendingDeletes.has(m.id))
      const mealList = sortMealsByTime(filteredList)
      set({
        meals: mealList,
        dailySummary:
          data && !Array.isArray(data)
            ? computeUpdatedSummary(data, mealList)
            : null,
        isLoading: false,
      })
      get().fetchPreviousDayMeals(targetDate)
    } catch (err: any) {
      if (requestId !== latestFetchRequestId) return
      set({
        error: err.message || 'Ошибка загрузки приемов пищи',
        isLoading: false,
      })
    }
  },
```

  4. В `copyMultipleMealsToDate` сохраняй исходное время каждого копируемого блюда из `previousDayMeals`:

```ts
  copyMultipleMealsToDate: async (mealIds: number[], targetDate?: string) => {
    set({ isLoading: true, error: null })
    try {
      const destDate = targetDate || get().selectedDate
      const prevMap = new Map(get().previousDayMeals.map((m) => [m.id, m]))
      const results: Meal[] = []
      for (const id of mealIds) {
        const sourceMeal = prevMap.get(id)
        const preserveTime = sourceMeal?.meal_time ? sourceMeal.meal_time.slice(0, 5) : undefined
        const copied = await mealsApi.copyMeal(id, destDate, preserveTime)
        results.push(copied)
      }
      if (destDate === get().selectedDate) {
        set((state) => {
          const updatedMeals = sortMealsByTime([...results, ...state.meals])
          return {
            meals: updatedMeals,
            dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            isLoading: false,
          }
        })
      } else {
        set({ isLoading: false })
      }
      useUIStore.getState().addToast(`Скопировано блюд: ${results.length}`, 'success', 3000)
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Ошибка копирования блюд' })
      useUIStore.getState().addToast(err.message || 'Ошибка копирования блюд', 'error')
      throw err
    }
  },
```

  5. В `frontend/src/components/meals/MealCard.tsx` (строка 107) в `handleCopyMeal` копируй в выбранный в календаре день `selectedDate` (из `useMealsStore`), а не всегда в `getTodayDateString()`:

```ts
  const { deleteMealWithUndo, updateMeal, copyMealToDate, recalculateMeal, selectedDate } = useMealsStore()
  ...
  const handleCopyMeal = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await copyMealToDate(meal.id, selectedDate || getTodayDateString())
    } catch {
      // Handled in store
    }
  }
```

---

### BUG-F02. Унификация дефолтных целей КБЖУ (`2000 / 140 / 70 / 250`) в `ProfilePage.tsx`, `StatsPage.tsx` и `ProgressRings.tsx`

* **Файлы**: `frontend/src/pages/ProfilePage.tsx` (строки 148–151), `frontend/src/pages/StatsPage.tsx` (строки 167–174), `frontend/src/components/stats/ProgressRings.tsx` (строка 36).
* **Исправление**:
  1. В `frontend/src/pages/ProfilePage.tsx` (строки 148–151) замени `2200 / 140 / 73 / 275` на `2000 / 140 / 70 / 250`:
     ```ts
     daily_calories_goal: parseInt(goalCalories, 10) || 2000,
     daily_protein_goal: parseInt(goalProtein, 10) || 140,
     daily_fat_goal: parseInt(goalFat, 10) || 70,
     daily_carbs_goal: parseInt(goalCarbs, 10) || 250,
     ```
  2. В `frontend/src/pages/StatsPage.tsx` (строки 167–174) замени `user?.daily_fat_goal || 73` на `user?.daily_fat_goal || 70` и `user?.daily_carbs_goal || 275` на `user?.daily_carbs_goal || 250`.
  3. В `frontend/src/components/stats/ProgressRings.tsx` (строка 36) замени `target: protein.target || 120` на `target: protein.target || 140`.

---

### BUG-F05 и BUG-F06. Сохранение состава ингредиентов при сохранении блюда как рецепта и очистка `AIResultModal`

* **Файлы**: `frontend/src/api/recipes.ts` (строки 74–85), `frontend/src/components/meals/AIResultModal.tsx` (строка 53).
* **Проблема**:
  1. В `recipesApi.saveMealAsRecipe(meal)` состав `meal.ingredients` полностью игнорируется, хотя у блюда есть список ингредиентов.
  2. В `AIResultModal.tsx` при вызове `addMeal` не передаются `ingredients: aiResultData?.ingredients`.
* **Исправление**:
  1. В `frontend/src/api/recipes.ts` в `saveMealAsRecipe` формируй подробное описание из `meal.ingredients`, чтобы пользователь видел все ингредиенты и их граммовки в карточке сохранённого рецепта:

```ts
  async saveMealAsRecipe(meal: Meal): Promise<Recipe> {
    const weight = meal.weight_grams && meal.weight_grams > 0 ? meal.weight_grams : 100
    const ingSummary =
      Array.isArray(meal.ingredients) && meal.ingredients.length > 0
        ? `Состав: ${meal.ingredients.map((i) => `${i.name} (${Math.round(i.weight_grams)}г)`).join(', ')}`
        : `Рецепт из дневника питания (${meal.meal_date})`

    return this.createQuickRecipe({
      name: meal.name,
      description: ingSummary,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
      weight_grams: weight,
    })
  },
```

  2. В `frontend/src/components/meals/AIResultModal.tsx` (строка 62) добавь передачу `ingredients: aiResultData?.ingredients || []` в `addMeal({...})`.

---

### BUG-F07. Добавление выбора даты блюда в `EditMealModal.tsx` и кнопки создания своего продукта в `ProductSearch.tsx`

* **Файлы**: `frontend/src/components/meals/EditMealModal.tsx` и `frontend/src/components/products/ProductSearch.tsx`.
* **Исправление**:
  1. В `frontend/src/components/meals/EditMealModal.tsx`:
     - Добавь `meal_date: ''` в стейт `form` (инициализируй из `editingMeal.meal_date || ''`).
     - При сабмите передавай `meal_date: form.meal_date || undefined` в `updateMeal`.
     - В JSX замени одиночный `<Input label="Время приёма" type="time" ... />` на двухколоночный блок даты и времени:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Дата приёма"
            type="date"
            value={form.meal_date}
            onChange={(e) => setForm({ ...form, meal_date: e.target.value })}
          />
          <Input
            label="Время приёма"
            type="time"
            value={form.meal_time}
            onChange={(e) => setForm({ ...form, meal_time: e.target.value })}
          />
        </div>
```

  2. В `frontend/src/components/products/ProductSearch.tsx` добавь возможность прямо из поиска быстро сохранить новый кастомный продукт в базу (`productsApi.createProduct`), если поиск ничего не нашёл или пользователь нажал «+ Свой продукт в базу»:

```tsx
  const [isCreatingCustom, setIsCreatingCustom] = useState(false)
  const [customForm, setCustomForm] = useState({
    name: '',
    calories_per_100g: '',
    protein_per_100g: '',
    fat_per_100g: '',
    carbs_per_100g: '',
  })

  const handleCreateCustomProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customForm.name.trim()) return
    try {
      const created = await productsApi.createProduct({
        name: customForm.name.trim(),
        calories_per_100g: parseFloat(customForm.calories_per_100g) || 0,
        protein_per_100g: parseFloat(customForm.protein_per_100g) || 0,
        fat_per_100g: parseFloat(customForm.fat_per_100g) || 0,
        carbs_per_100g: parseFloat(customForm.carbs_per_100g) || 0,
        category: 'Мои продукты',
      })
      setProducts((prev) => [created, ...prev])
      setSelectedProduct(created)
      setIsCreatingCustom(false)
      setCustomForm({ name: '', calories_per_100g: '', protein_per_100g: '', fat_per_100g: '', carbs_per_100g: '' })
    } catch {
      // ignore
    }
  }
```
  И в блоке пустого результата (`query ? ...`) добавь кнопку `«+ Добавить "${query}" в мою базу продуктов»`, открывающую компактную форму `isCreatingCustom`.

---

### BUG-F08. Исключение перехвата `Ctrl+V` при фокусе в полях ввода (`AddMealModal.tsx` и `BarcodeScannerView.tsx`)

* **Файлы**: `frontend/src/components/meals/AddMealModal.tsx` (строки 96–117) и `frontend/src/components/barcode/BarcodeScannerView.tsx` (строки 417–436).
* **Проблема**: Если пользователь вставляет текст через `Ctrl+V` в `input` или `textarea`, а в системном буфере обмена помимо текста есть картинка (например, при копировании из браузера или мессенджера), глобальный обработчик `paste` перехватывает событие и сбрасывает ввод.
* **Исправление**:
  В обоих файлах (`AddMealModal.tsx` и `BarcodeScannerView.tsx`) в начале `handlePaste` добавь проверку активного элемента, а в `AddMealModal.tsx` не перехватывай `paste`, если `mode === 'barcode'`:

```ts
    const handlePaste = (e: ClipboardEvent) => {
      if (mode === 'barcode') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        // Если в буфере есть обычный текст, позволяем стандартную вставку в поле ввода
        if (e.clipboardData?.getData('text/plain')) {
          return
        }
      }
      ...
```

---

### BUG-F09. Добавление периода «Год» в `frontend/src/components/stats/PeriodSelector.tsx`

* **Файл**: `frontend/src/components/stats/PeriodSelector.tsx`.
* **Исправление**:
  Расширь тип `PeriodType` до `'today' | 'week' | 'month' | 'year'` и добавь четвёртую кнопку `{ key: 'year', label: 'Год' }` в массив `periods`:

```tsx
export type PeriodType = 'today' | 'week' | 'month' | 'year'

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onSelectPeriod,
}) => {
  const periods: { key: PeriodType; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: '7 дней' },
    { key: 'month', label: '30 дней' },
    { key: 'year', label: 'Год' },
  ]
  ...
```

---

### BUG-F11. Исправление офлайн-навигации SPA в `frontend/public/sw.js` и очистка дублей бандлов

* **Файлы**: `frontend/public/sw.js` (и `backend/static/sw.js`), а также папка `backend/static/assets/`.
* **Проблема**:
  1. В `sw.js` при офлайн-переходе по маршруту `/stats` или `/profile` вызов `caches.match(event.request)` не находит HTML-файл, так как в кэше лежит только `/index.html`.
  2. В `backend/static/assets/` лежат старые неиспользуемые сборки (`index-B_4ZrLwT.js`, `index-B_jsvXo-.css`).
* **Исправление**:
  В `frontend/public/sw.js` обнови блок `.catch()` в обработчике `fetch`:

```js
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return undefined
        })
      })
```

---

## Чек-лист проверки после выполнения Части 1

1. Запусти тесты бэкенда:
   ```bash
   cd backend && pytest -v
   ```
2. Проверь сборку и типизацию фронтенда и обнови `backend/static`:
   ```bash
   cd frontend && npm run build
   rm -rf ../backend/static/assets
   cp -r dist/* ../backend/static/
   ```
