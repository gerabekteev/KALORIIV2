# Техническое задание для ИИ-агента (Часть 2): Реализация вкладки «Что съесть» (AI-генератор меню) и Голосового дневника + Telegram-бота в KaloriiAI (kaloriiv2)

Данный документ содержит полную техническую спецификацию и готовый к внедрению исходный код для реализации двух крупных функциональных обновлений проекта **KaloriiAI (`kaloriiv2`)**:

1. **ФИЧА 1 (`FEAT-MEAL-PLAN`): Вкладка «Что съесть» — Умный AI-планировщик питания под остаток КБЖУ** с выбором даты, количества приёмов пищи, автоподстановкой и ручным редактированием целевых КБЖУ, жёстким контролем непревышения калорийности, сохранением сгенерированного меню в БД и браузере, закреплением отдельных блюд при частичной перегенерации и добавлением любого блюда в съеденное одной кнопкой.
2. **ФИЧА 2 (`FEAT-VOICE-TG`): Голосовой дневник питания (Voice-to-Log на сайте и в Telegram) и двусторонний Telegram-бот**, привязываемый к аккаунту пользователя, который автоматически распознаёт и вносит в базу: (а) любые фотографии с подписью, (б) любые текстовые сообщения, (в) любые голосовые сообщения — с обязательным сохранением текстовой транскрибации в поле описания блюда (`user_comment`) на сайте для свободного редактирования и повторного AI-пересчёта.

---

## Обзор создаваемых и изменяемых файлов

| Файл | Действие | Назначение |
| :--- | :--- | :--- |
| `backend/alembic/versions/0005_add_meal_plans_and_telegram.py` | **Создать** | Миграция БД: таблица `meal_plans` и колонки Telegram в таблице `users` |
| `backend/app/models/user.py` | **Обновить** | Добавление полей `telegram_chat_id`, `telegram_username`, `telegram_link_code`, `telegram_link_expires_at` и связи `meal_plans` |
| `backend/app/models/meal_plan.py` | **Создать** | ORM-модель `MealPlan` для хранения сгенерированных меню пользователя по датам |
| `backend/app/models/__init__.py` | **Обновить** | Экспорт модели `MealPlan` |
| `backend/app/config.py` | **Обновить** | Настройки `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME` |
| `backend/app/schemas/ai.py` | **Обновить** | Поле `transcription` в `FoodAnalysisResult` / `FoodRecognitionResponse` и схемы для генератора меню |
| `backend/app/utils/ai_providers/base.py` | **Обновить** | Промпты и парсеры для голосового ввода (`build_voice_prompt`) и генерации меню (`build_meal_plan_prompt`, `parse_meal_plan_result`) с жёстким потолком калорий |
| `backend/app/utils/ai_providers/gemini.py` | **Обновить** | Поддержка `analyze_food_voice` (аудио в `inlineData`) и `generate_meal_plan` |
| `backend/app/utils/ai_providers/openrouter.py` | **Обновить** | Поддержка `analyze_food_voice` (`input_audio`) и `generate_meal_plan` |
| `backend/app/services/ai_router.py` | **Обновить** | Методы `recognize_food_by_voice` и `generate_meal_plan` с фолбэком по приоритетам моделей пользователя |
| `backend/app/routers/ai.py` | **Обновить** | Новый эндпоинт `POST /api/ai/recognize-voice` для голосового ввода на сайте |
| `backend/app/routers/meal_plan.py` | **Создать** | Роутер `/api/meal-plan` (получение сохранённого плана, генерация/перегенерация с закреплёнными блюдами, обновление статуса) |
| `backend/app/routers/telegram.py` | **Создать** | Роутер `/api/telegram` (генерация кода привязки, проверка статуса, отвязка аккаунта) |
| `backend/app/services/telegram_bot.py` | **Создать** | Фоновый сервис Telegram-бота (Long Polling через `httpx`): привязка `/start`, обработка фото+текст, текста и голосовых сообщений |
| `backend/app/main.py` | **Обновить** | Регистрация роутеров `meal_plan` и `telegram`, `ALTER TABLE` в `lifespan` и запуск фонового поллинга Telegram-бота |
| `frontend/src/types/index.ts` | **Обновить** | Типы для `PlannedMealItem`, `MealPlanResponse`, `TelegramStatusResponse` и поля `transcription` |
| `frontend/src/api/ai.ts` | **Обновить** | Метод `recognizeVoice(audioBlob)` |
| `frontend/src/api/mealPlan.ts` | **Создать** | API-клиент для `/api/meal-plan` |
| `frontend/src/api/telegram.ts` | **Создать** | API-клиент для `/api/telegram` |
| `frontend/src/store/mealPlanStore.ts` | **Создать** | Zustand-стор планировщика меню с сохранением в БД и `localStorage` |
| `frontend/src/store/mealsStore.ts` | **Обновить** | Метод `startVoiceAIAnalysis` с сохранением транскрибации в `user_comment` |
| `frontend/src/pages/MealPlanPage.tsx` | **Создать** | Новая страница вкладки «Что съесть» (выбор даты, кол-ва блюд, КБЖУ, закрепление блюд, перегенерация, добавление в дневник) |
| `frontend/src/components/layout/BottomNav.tsx` | **Обновить** | Добавление вкладки «Что съесть» в нижнюю панель навигации |
| `frontend/src/App.tsx` | **Обновить** | Маршрут `<Route path="meal-plan" element={<MealPlanPage />} />` |
| `frontend/src/components/meals/AddMealModal.tsx` | **Обновить** | Кнопка и экран записи голосового описания еды («Голос AI») |
| `frontend/src/components/settings/TelegramBotCard.tsx` | **Создать** | Карточка привязки Telegram-бота в профиле пользователя |
| `frontend/src/pages/ProfilePage.tsx` | **Обновить** | Подключение `<TelegramBotCard />` на страницу профиля |

---

## ЧАСТЬ А. Изменения на стороне Бэкенда (FastAPI + SQLAlchemy + AI Router + Telegram Bot)

### Шаг 1. Настройки окружения в `backend/app/config.py` и `backend/.env.example`

В `backend/app/config.py` внутри класса `Settings` (после `GEMINI_PROXY_URL`) добавь настройки Telegram-бота:

```python
    # Telegram Bot Integration
    TELEGRAM_BOT_TOKEN: str = Field(
        default="",
        description="Telegram Bot token from @BotFather for logging meals via Telegram",
    )
    TELEGRAM_BOT_USERNAME: str = Field(
        default="",
        description="Telegram Bot username (without @), e.g. KaloriiAIBot",
    )
```

В `backend/.env.example` добавь строки:
```env
# Telegram Bot (get token from @BotFather)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
```

---

### Шаг 2. Модели базы данных (`user.py`, `meal_plan.py`, `models/__init__.py`) и миграция Alembic

#### 2.1. Создай файл `backend/app/models/meal_plan.py`

```python
import json
from datetime import datetime, date
from typing import TYPE_CHECKING, Optional, List, Any
from sqlalchemy import String, Float, Integer, DateTime, Date, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class MealPlan(Base):
    __tablename__ = "meal_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "plan_date", name="uq_meal_plans_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    meals_count: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    target_calories: Mapped[float] = mapped_column(Float, nullable=False)
    target_protein: Mapped[float] = mapped_column(Float, nullable=False)
    target_fat: Mapped[float] = mapped_column(Float, nullable=False)
    target_carbs: Mapped[float] = mapped_column(Float, nullable=False)
    user_preferences: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    meals_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    provider_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="meal_plans")

    @property
    def meals(self) -> List[dict[str, Any]]:
        if not self.meals_json:
            return []
        try:
            data = json.loads(self.meals_json)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    @meals.setter
    def meals(self, value: Any) -> None:
        if value is None:
            self.meals_json = "[]"
        elif isinstance(value, str):
            self.meals_json = value
        else:
            self.meals_json = json.dumps(value, ensure_ascii=False)
```

#### 2.2. Обнови `backend/app/models/user.py`

В `backend/app/models/user.py`:
1. В блок `if TYPE_CHECKING:` добавь `from app.models.meal_plan import MealPlan`.
2. В класс `User` (после `ai_settings_json`) добавь поля привязки Telegram:

```python
    # Telegram integration
    telegram_chat_id: Mapped[Optional[int]] = mapped_column(
        Integer, unique=True, index=True, nullable=True
    )
    telegram_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    telegram_link_code: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    telegram_link_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
```

3. В секцию `# Relationships` класса `User` добавь:

```python
    meal_plans: Mapped[List["MealPlan"]] = relationship(
        "MealPlan", back_populates="user", cascade="all, delete-orphan"
    )
```

#### 2.3. Обнови `backend/app/models/__init__.py`

```python
from app.models.user import User, WeightLog
from app.models.meal import Meal
from app.models.product import Product
from app.models.recipe import Recipe, RecipeItem
from app.models.scanned_product import UserScannedProduct
from app.models.meal_plan import MealPlan

__all__ = [
    "User",
    "WeightLog",
    "Meal",
    "Product",
    "Recipe",
    "RecipeItem",
    "UserScannedProduct",
    "MealPlan",
]
```

#### 2.4. Создай миграцию `backend/alembic/versions/0005_add_meal_plans_and_telegram.py`

```python
"""Add meal_plans table and telegram columns to users

Revision ID: 0005_add_meal_plans_and_telegram
Revises: 0004_add_meal_ingredients
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_meal_plans_and_telegram"
down_revision: Union[str, None] = "0004_add_meal_ingredients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_cols = [col["name"] for col in inspector.get_columns("users")]
    if "telegram_chat_id" not in user_cols:
        op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    if "telegram_username" not in user_cols:
        op.add_column("users", sa.Column("telegram_username", sa.String(length=100), nullable=True))
    if "telegram_link_code" not in user_cols:
        op.add_column("users", sa.Column("telegram_link_code", sa.String(length=64), nullable=True))
    if "telegram_link_expires_at" not in user_cols:
        op.add_column("users", sa.Column("telegram_link_expires_at", sa.DateTime(), nullable=True))

    tables = inspector.get_table_names()
    if "meal_plans" not in tables:
        op.create_table(
            "meal_plans",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("plan_date", sa.Date(), nullable=False),
            sa.Column("meals_count", sa.Integer(), server_default="3", nullable=False),
            sa.Column("target_calories", sa.Float(), nullable=False),
            sa.Column("target_protein", sa.Float(), nullable=False),
            sa.Column("target_fat", sa.Float(), nullable=False),
            sa.Column("target_carbs", sa.Float(), nullable=False),
            sa.Column("user_preferences", sa.String(length=500), nullable=True),
            sa.Column("meals_json", sa.Text(), server_default="[]", nullable=False),
            sa.Column("provider_used", sa.String(length=100), nullable=True),
            sa.Column("model_used", sa.String(length=150), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "plan_date", name="uq_meal_plans_user_date"),
        )
        op.create_index(op.f("ix_meal_plans_id"), "meal_plans", ["id"], unique=False)
        op.create_index(op.f("ix_meal_plans_user_id"), "meal_plans", ["user_id"], unique=False)
        op.create_index(op.f("ix_meal_plans_plan_date"), "meal_plans", ["plan_date"], unique=False)


def downgrade() -> None:
    op.drop_table("meal_plans")
```

---

### Шаг 3. Схемы Pydantic в `backend/app/schemas/ai.py`

Обнови `backend/app/schemas/ai.py` целиком (добавлено поле `transcription` для голосовых сообщений и схемы для генератора меню `PlannedMealItem`, `MealPlanGenerateRequest`, `MealPlanSaveRequest`, `MealPlanResponse`):

```python
from datetime import date, datetime
from typing import Optional, Literal, List
from pydantic import BaseModel, Field, field_validator, ConfigDict, AliasChoices


class MealIngredientItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    weight_grams: float = Field(..., ge=0, le=10000)
    calories: float = Field(..., ge=0, le=20000)
    protein: float = Field(..., ge=0, le=5000)
    fat: float = Field(..., ge=0, le=5000)
    carbs: float = Field(..., ge=0, le=5000)


class FoodAnalysisResult(BaseModel):
    name: str = Field(..., description="Food or dish name")
    weight_grams: float = Field(..., ge=0, description="Estimated weight in grams")
    calories: float = Field(..., ge=0, description="Calories in kcal")
    protein: float = Field(..., ge=0, description="Protein in grams")
    fat: float = Field(..., ge=0, description="Fat in grams")
    carbs: float = Field(..., ge=0, description="Carbohydrates in grams")
    confidence: Literal["high", "medium", "low"] = Field(
        "medium", description="Confidence level of recognition"
    )
    transcription: Optional[str] = Field(
        None, description="Verbatim voice transcription if recognized from audio"
    )
    raw_response: Optional[str] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class FoodRecognitionResponse(BaseModel):
    name: str
    weight_grams: float
    calories: float
    protein: float
    fat: float
    carbs: float
    confidence: str
    photo_path: Optional[str] = None
    transcription: Optional[str] = None
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    raw_response: Optional[str] = None
    ingredients: List[MealIngredientItem] = Field(default_factory=list)


class TextAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Текстовое описание блюда или продуктов")

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Описание блюда не может быть пустым")
        return trimmed


class PlannedMealItem(BaseModel):
    id: str = Field(..., description="Уникальный локальный ID карточки блюда в плане")
    meal_label: str = Field(default="Приём пищи", description="Например: Приём пищи 1 / Завтрак / Обед / Ужин")
    name: str = Field(..., min_length=1, max_length=255)
    weight_grams: float = Field(..., ge=0)
    calories: float = Field(..., ge=0)
    protein: float = Field(..., ge=0)
    fat: float = Field(..., ge=0)
    carbs: float = Field(..., ge=0)
    ingredients: List[MealIngredientItem] = Field(default_factory=list)
    locked: bool = Field(default=False, description="Если True — блюдо закреплено пользователем и не перегенерируется")
    added_to_diary: bool = Field(default=False, description="Отметка, что пользователь уже добавил это блюдо в дневник")


class MealPlanGenerateRequest(BaseModel):
    plan_date: date = Field(..., description="Дата, на которую планируется питание")
    meals_count: int = Field(default=3, ge=1, le=6, description="Общее количество блюд/приёмов пищи")
    target_calories: float = Field(..., ge=100, le=15000, description="Лимит калорий (главный приоритет — не превысить!)")
    target_protein: float = Field(default=100, ge=0, le=2000)
    target_fat: float = Field(default=50, ge=0, le=2000)
    target_carbs: float = Field(default=150, ge=0, le=3000)
    user_preferences: Optional[str] = Field(None, max_length=500, description="Пожелания или исключения")
    locked_meals: List[PlannedMealItem] = Field(
        default_factory=list,
        description="Блюда, которые пользователь решил оставить (закрепил) при перегенерации остальных",
    )


class MealPlanSaveRequest(BaseModel):
    plan_date: date
    meals_count: int = Field(default=3, ge=1, le=6)
    target_calories: float = Field(..., ge=50, le=15000)
    target_protein: float = Field(default=0, ge=0, le=2000)
    target_fat: float = Field(default=0, ge=0, le=2000)
    target_carbs: float = Field(default=0, ge=0, le=3000)
    user_preferences: Optional[str] = Field(None, max_length=500)
    meals: List[PlannedMealItem] = Field(default_factory=list)


class MealPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    plan_date: date
    meals_count: int
    target_calories: float
    target_protein: float
    target_fat: float
    target_carbs: float
    user_preferences: Optional[str] = None
    total_generated_calories: float = 0.0
    total_generated_protein: float = 0.0
    total_generated_fat: float = 0.0
    total_generated_carbs: float = 0.0
    meals: List[PlannedMealItem] = Field(default_factory=list)
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    updated_at: Optional[datetime] = None


class AISettingsModelItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    provider: str
    description: Optional[str] = None
    enabled: bool = True


class UserAISettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    models: List[AISettingsModelItem]
    gemini_api_key: Optional[str] = Field(None, validation_alias=AliasChoices("gemini_api_key", "geminiApiKey"))
    openrouter_api_key: Optional[str] = Field(None, validation_alias=AliasChoices("openrouter_api_key", "openrouterApiKey"))
    geminiApiKey: Optional[str] = None
    openrouterApiKey: Optional[str] = None


class UserAISettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    models: List[AISettingsModelItem]
    gemini_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    geminiApiKey: Optional[str] = None
    openrouterApiKey: Optional[str] = None
```

---

### Шаг 4. Обновление AI-провайдеров (`base.py`, `gemini.py`, `openrouter.py`) и `ai_router.py`

#### 4.1. Обнови `backend/app/utils/ai_providers/base.py`

Добавь в `backend/app/utils/ai_providers/base.py`:
1. Функцию `build_voice_prompt()` для расшифровки голосового сообщения и одновременного расчёта КБЖУ.
2. Функцию `build_meal_plan_prompt(...)` и `parse_meal_plan_result(...)` с **жёстким математическим контролем непревышения `max_calories`**.
3. В `parse_food_result(raw_json)` сохраняй поле `transcription`.
4. В абстрактный класс `BaseAIProvider` добавь методы `analyze_food_voice` и `generate_meal_plan`.

Полный код `backend/app/utils/ai_providers/base.py`:

```python
import abc
import json
import re
import uuid
from typing import Optional, Dict, Any, List
from app.schemas.ai import FoodAnalysisResult, MealIngredientItem, PlannedMealItem


class AIProviderError(Exception):
    """Base exception for AI provider failures."""
    pass


class AIRateLimitError(AIProviderError):
    """Raised when an AI provider returns HTTP 429 or quota exceeded."""
    pass


class AIAuthenticationError(AIProviderError):
    """Raised when API key is missing or invalid."""
    pass


def build_system_prompt(user_comment: Optional[str] = None) -> str:
    """Build standardized food recognition prompt according to KaloriiAI specifications."""
    comment_clause = f"\nПояснение пользователя: {user_comment.strip()}" if user_comment and user_comment.strip() else ""

    return (
        "Ты — эксперт-нутрициолог. Проанализируй фото еды и определи:\n"
        "1. Название блюда/продукта\n"
        "2. Примерный вес порции в граммах\n"
        "3. Калории (ккал)\n"
        "4. Белки (г)\n"
        "5. Жиры (г)\n"
        "6. Углеводы (г)\n"
        "7. Массив отдельных компонентов/ингредиентов (ingredients), входящих в состав блюда\n\n"
        "ВАЖНО (Распознавание скриншотов и OCR):\n"
        "Если на изображении представлен скриншот экрана (приложение доставки еды — Яндекс Еда, Самокат, Додо и т.д., таблица пищевой ценности КБЖУ, этикетка продукта, чек, меню или скриншот рецепта) — распознай напечатанный текст, найди точные указанные значения веса в граммах, калорий, белков, жиров и углеводов и верни их в JSON!"
        f"{comment_clause}\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "name": "название всего блюда",\n'
        '  "weight_grams": число,\n'
        '  "calories": число,\n'
        '  "protein": число,\n'
        '  "fat": число,\n'
        '  "carbs": число,\n'
        '  "confidence": "high/medium/low",\n'
        '  "ingredients": [\n'
        "    {\n"
        '      "name": "название ингредиента/компонента",\n'
        '      "weight_grams": число,\n'
        '      "calories": число,\n'
        '      "protein": число,\n'
        '      "fat": число,\n'
        '      "carbs": число\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def build_text_prompt(text: str) -> str:
    """Build standardized food recognition prompt for text input according to KaloriiAI specifications."""
    return (
        "Ты — эксперт-нутрициолог. Пользователь описал свой приём пищи:\n"
        f'"{text.strip()}"\n\n'
        "Определи:\n"
        "1. Название блюда/продукта\n"
        "2. Примерный вес порции в граммах (если вес или количество указаны в тексте, используй их; иначе оцени реалистичный стандартный вес порции)\n"
        "3. Калории (ккал)\n"
        "4. Белки (г)\n"
        "5. Жиры (г)\n"
        "6. Углеводы (г)\n"
        "7. Массив отдельных компонентов/ингредиентов (ingredients), входящих в состав блюда\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "name": "название всего блюда",\n'
        '  "weight_grams": число,\n'
        '  "calories": число,\n'
        '  "protein": число,\n'
        '  "fat": число,\n'
        '  "carbs": число,\n'
        '  "confidence": "high/medium/low",\n'
        '  "ingredients": [\n'
        "    {\n"
        '      "name": "название ингредиента/компонента",\n'
        '      "weight_grams": число,\n'
        '      "calories": число,\n'
        '      "protein": число,\n'
        '      "fat": число,\n'
        '      "carbs": число\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def build_voice_prompt() -> str:
    """Build standardized prompt for voice audio food recognition + verbatim transcription."""
    return (
        "Ты — эксперт-нутрициолог. Прослушай голосовое сообщение пользователя, в котором он рассказывает, что он съел.\n"
        "Выполни две задачи:\n"
        "1. Дословно и точно транскрибируй речь пользователя на русском языке в поле `transcription` (сохрани все названные продукты, граммовки и детали, чтобы пользователь мог видеть и редактировать это описание на сайте).\n"
        "2. На основе сказанного определи общее название приёма пищи, вес в граммах, калории, белки, жиры, углеводы и массив отдельных ингредиентов (`ingredients`).\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "transcription": "дословная текстовая расшифровка голосового сообщения пользователя",\n'
        '  "name": "краткое и понятное название блюда/приёма пищи",\n'
        '  "weight_grams": число,\n'
        '  "calories": число,\n'
        '  "protein": число,\n'
        '  "fat": число,\n'
        '  "carbs": число,\n'
        '  "confidence": "high/medium/low",\n'
        '  "ingredients": [\n'
        "    {\n"
        '      "name": "название ингредиента",\n'
        '      "weight_grams": число,\n'
        '      "calories": число,\n'
        '      "protein": число,\n'
        '      "fat": число,\n'
        '      "carbs": число\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def build_meal_plan_prompt(
    meals_to_generate: int,
    max_calories: float,
    target_protein: float,
    target_fat: float,
    target_carbs: float,
    user_preferences: Optional[str] = None,
    locked_meal_names: Optional[List[str]] = None,
    favorite_products_hint: Optional[str] = None,
) -> str:
    """
    Build prompt for generating a daily meal plan where NOT EXCEEDING max_calories is the primary constraint.
    """
    prefs_clause = (
        f"\nПожелания пользователя: {user_preferences.strip()}"
        if user_preferences and user_preferences.strip()
        else ""
    )
    locked_clause = (
        f"\nУ пользователя уже закреплены в меню следующие блюда (НЕ повторяй их): {', '.join(locked_meal_names)}."
        if locked_meal_names
        else ""
    )
    fav_clause = (
        f"\nПривычные и любимые продукты пользователя (можешь использовать их при составлении блюд, если они подходят): {favorite_products_hint}"
        if favorite_products_hint
        else ""
    )

    min_cal = round(max_calories * 0.85)
    strict_max_cal = round(max_calories)

    return (
        "Ты — профессиональный AI-нутрициолог. Составь рацион питания для пользователя.\n"
        f"Необходимо сгенерировать ровно {meals_to_generate} блюд(а) (приёмов пищи).\n\n"
        "ГЛАВНОЕ И СТРОГОЕ ПРАВИЛО:\n"
        f"- Суммарная калорийность всех {meals_to_generate} сгенерированных блюд НЕ ДОЛЖНА ПРЕВЫШАТЬ {strict_max_cal} ккал! "
        f"(Целевой коридор суммы калорий: от {min_cal} до {strict_max_cal} ккал, выход за верхнюю границу {strict_max_cal} ккал категорически запрещён).\n"
        f"- Вторичные ориентиры по БЖУ на эти {meals_to_generate} блюд(а): Белки ~{round(target_protein)}г, Жиры ~{round(target_fat)}г, Углеводы ~{round(target_carbs)}г (постарайся приблизиться к ним, но главное — не превысить лимит {strict_max_cal} ккал!).\n"
        "- Каждое блюдо должно состоять из простых, понятных и доступных ингредиентов.\n"
        "- Рецепт каждого блюда — это просто точный состав его ингредиентов (ingredients) с граммовками и КБЖУ каждого компонента, сумма которых даёт КБЖУ самого блюда."
        f"{prefs_clause}{locked_clause}{fav_clause}\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "meals": [\n'
        "    {\n"
        '      "meal_label": "Приём пищи 1 (например: Завтрак / Обед / Ужин / Перекус)",\n'
        '      "name": "Название блюда",\n'
        '      "weight_grams": число,\n'
        '      "calories": число,\n'
        '      "protein": число,\n'
        '      "fat": число,\n'
        '      "carbs": число,\n'
        '      "ingredients": [\n'
        "        {\n"
        '          "name": "Название ингредиента",\n'
        '          "weight_grams": число,\n'
        '          "calories": число,\n'
        '          "protein": число,\n'
        '          "fat": число,\n'
        '          "carbs": число\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}"
    )


def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract valid JSON from LLM response text, stripping markdown code fences and thought blocks if present."""
    text = text.strip()

    # Strip reasoning / thought tags if present
    text = re.sub(r"<(?:thought|thinking|think)>[\s\S]*?</(?:thought|thinking|think)>", "", text, flags=re.IGNORECASE).strip()

    # Look for ```json ... ``` or ``` ... ```
    code_block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if code_block_match:
        text = code_block_match.group(1).strip()

    # If starts with { and ends with }, parse directly
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: find first { and last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_substr = text[start : end + 1]
            return json.loads(json_substr)
        raise AIProviderError(f"Не удалось распарсить JSON из ответа нейросети: {text[:200]}")


def _parse_float_safely(val: Any, default: float = 0.0) -> float:
    """Safely extract float from numbers or strings with units like '300g' or '~250'."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip().replace(",", ".")
    match = re.search(r"[-+]?\d*\.?\d+", val_str)
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            pass
    return default


def parse_food_result(raw_json: Dict[str, Any]) -> FoodAnalysisResult:
    """Validate and normalize raw JSON into FoodAnalysisResult."""
    confidence = str(raw_json.get("confidence", "medium")).lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"

    name = str(raw_json.get("name", "Блюдо")).strip() or "Блюдо"
    weight_grams = max(0.0, _parse_float_safely(raw_json.get("weight_grams"), 100.0))
    calories = max(0.0, _parse_float_safely(raw_json.get("calories"), 0.0))
    protein = max(0.0, _parse_float_safely(raw_json.get("protein"), 0.0))
    fat = max(0.0, _parse_float_safely(raw_json.get("fat"), 0.0))
    carbs = max(0.0, _parse_float_safely(raw_json.get("carbs"), 0.0))

    raw_transcription = raw_json.get("transcription")
    transcription = str(raw_transcription).strip() if raw_transcription else None

    # Parse ingredients
    ingredients: List[MealIngredientItem] = []
    raw_ingredients = raw_json.get("ingredients")
    if isinstance(raw_ingredients, list):
        for item in raw_ingredients:
            if isinstance(item, dict) and item.get("name"):
                ing_name = str(item.get("name")).strip()
                ing_weight = max(0.0, _parse_float_safely(item.get("weight_grams"), 0.0))
                ing_cal = max(0.0, _parse_float_safely(item.get("calories"), 0.0))
                ing_prot = max(0.0, _parse_float_safely(item.get("protein"), 0.0))
                ing_fat = max(0.0, _parse_float_safely(item.get("fat"), 0.0))
                ing_carbs = max(0.0, _parse_float_safely(item.get("carbs"), 0.0))
                ingredients.append(
                    MealIngredientItem(
                        name=ing_name,
                        weight_grams=round(ing_weight, 1),
                        calories=round(ing_cal, 1),
                        protein=round(ing_prot, 1),
                        fat=round(ing_fat, 1),
                        carbs=round(ing_carbs, 1),
                    )
                )

    # Validate sum consistency if 2 or more ingredients are present
    if len(ingredients) >= 2:
        sum_cal = sum(i.calories for i in ingredients)
        sum_weight = sum(i.weight_grams for i in ingredients)
        sum_prot = sum(i.protein for i in ingredients)
        sum_fat = sum(i.fat for i in ingredients)
        sum_carbs = sum(i.carbs for i in ingredients)

        diff_ratio = abs(sum_cal - calories) / (calories if calories > 0 else 1.0)
        if (diff_ratio > 0.15 or calories == 0) and sum_cal > 0:
            calories = round(sum_cal, 1)
            protein = round(sum_prot, 1)
            fat = round(sum_fat, 1)
            carbs = round(sum_carbs, 1)
            if sum_weight > 0:
                weight_grams = round(sum_weight, 1)

    raw_response_str = json.dumps(raw_json, ensure_ascii=False)

    return FoodAnalysisResult(
        name=name,
        weight_grams=round(weight_grams, 1),
        calories=round(calories, 1),
        protein=round(protein, 1),
        fat=round(fat, 1),
        carbs=round(carbs, 1),
        confidence=confidence,  # type: ignore[arg-type]
        transcription=transcription,
        raw_response=raw_response_str,
        ingredients=ingredients,
    )


def parse_meal_plan_result(
    raw_json: Dict[str, Any],
    expected_count: int,
    max_calories: float,
) -> List[PlannedMealItem]:
    """
    Parse and validate AI-generated meal plan list.
    Enforces hard calorie ceiling: if total calories of generated meals exceed max_calories,
    proportionally scales down portion weights and macros so total <= max_calories.
    """
    raw_meals = raw_json.get("meals")
    if not isinstance(raw_meals, list) or len(raw_meals) == 0:
        raise AIProviderError("Нейросеть вернула пустой список блюд для меню")

    parsed_meals: List[PlannedMealItem] = []
    for idx, item in enumerate(raw_meals[:expected_count]):
        if not isinstance(item, dict):
            continue
        m_name = str(item.get("name") or f"Блюдо {idx + 1}").strip()
        m_label = str(item.get("meal_label") or f"Приём пищи {idx + 1}").strip()

        ingredients: List[MealIngredientItem] = []
        raw_ings = item.get("ingredients")
        if isinstance(raw_ings, list):
            for ing in raw_ings:
                if isinstance(ing, dict) and ing.get("name"):
                    ingredients.append(
                        MealIngredientItem(
                            name=str(ing.get("name")).strip(),
                            weight_grams=round(max(1.0, _parse_float_safely(ing.get("weight_grams"), 50.0)), 1),
                            calories=round(max(0.0, _parse_float_safely(ing.get("calories"), 0.0)), 1),
                            protein=round(max(0.0, _parse_float_safely(ing.get("protein"), 0.0)), 1),
                            fat=round(max(0.0, _parse_float_safely(ing.get("fat"), 0.0)), 1),
                            carbs=round(max(0.0, _parse_float_safely(ing.get("carbs"), 0.0)), 1),
                        )
                    )

        if ingredients:
            cal = round(sum(i.calories for i in ingredients), 1)
            prot = round(sum(i.protein for i in ingredients), 1)
            fat = round(sum(i.fat for i in ingredients), 1)
            carbs = round(sum(i.carbs for i in ingredients), 1)
            weight = round(sum(i.weight_grams for i in ingredients), 1)
        else:
            cal = round(max(0.0, _parse_float_safely(item.get("calories"), 300.0)), 1)
            prot = round(max(0.0, _parse_float_safely(item.get("protein"), 20.0)), 1)
            fat = round(max(0.0, _parse_float_safely(item.get("fat"), 10.0)), 1)
            carbs = round(max(0.0, _parse_float_safely(item.get("carbs"), 30.0)), 1)
            weight = round(max(10.0, _parse_float_safely(item.get("weight_grams"), 200.0)), 1)

        parsed_meals.append(
            PlannedMealItem(
                id=f"plan-{uuid.uuid4().hex[:8]}",
                meal_label=m_label,
                name=m_name,
                weight_grams=weight,
                calories=cal,
                protein=prot,
                fat=fat,
                carbs=carbs,
                ingredients=ingredients,
                locked=False,
                added_to_diary=False,
            )
        )

    if not parsed_meals:
        raise AIProviderError("Не удалось распознать блюда в сгенерированном меню")

    # ЖЁСТКАЯ ГАРАНТИЯ НЕПРЕВЫШЕНИЯ КАЛОРИЙНОСТИ:
    # Если сумма калорий сгенерированных блюд превышает max_calories, масштабируем граммовки вниз
    total_cal = sum(m.calories for m in parsed_meals)
    if max_calories > 0 and total_cal > max_calories:
        scale_factor = (max_calories * 0.98) / total_cal
        for m in parsed_meals:
            if m.ingredients:
                for ing in m.ingredients:
                    ing.weight_grams = max(5.0, round(ing.weight_grams * scale_factor))
                    ing.calories = round(ing.calories * scale_factor, 1)
                    ing.protein = round(ing.protein * scale_factor, 1)
                    ing.fat = round(ing.fat * scale_factor, 1)
                    ing.carbs = round(ing.carbs * scale_factor, 1)
                m.weight_grams = round(sum(i.weight_grams for i in m.ingredients), 1)
                m.calories = round(sum(i.calories for i in m.ingredients), 1)
                m.protein = round(sum(i.protein for i in m.ingredients), 1)
                m.fat = round(sum(i.fat for i in m.ingredients), 1)
                m.carbs = round(sum(i.carbs for i in m.ingredients), 1)
            else:
                m.weight_grams = max(10.0, round(m.weight_grams * scale_factor))
                m.calories = round(m.calories * scale_factor, 1)
                m.protein = round(m.protein * scale_factor, 1)
                m.fat = round(m.fat * scale_factor, 1)
                m.carbs = round(m.carbs * scale_factor, 1)

    return parsed_meals


class BaseAIProvider(abc.ABC):
    """Abstract interface for multi-modal AI vision, voice, and meal planning providers."""

    def __init__(self, api_key: str, model_id: str, provider_name: str):
        self.api_key = api_key
        self.model_id = model_id
        self.provider_name = provider_name

    @abc.abstractmethod
    async def analyze_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
    ) -> FoodAnalysisResult:
        pass

    @abc.abstractmethod
    async def analyze_food_text(
        self,
        text: str,
    ) -> FoodAnalysisResult:
        pass

    @abc.abstractmethod
    async def analyze_food_voice(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/ogg",
    ) -> FoodAnalysisResult:
        pass

    @abc.abstractmethod
    async def generate_meal_plan(
        self,
        prompt: str,
        expected_count: int,
        max_calories: float,
    ) -> List[PlannedMealItem]:
        pass
```

#### 4.2. Обнови `backend/app/utils/ai_providers/gemini.py`

В `backend/app/utils/ai_providers/gemini.py`:
1. Импортируй `build_voice_prompt`, `parse_meal_plan_result`, `PlannedMealItem`.
2. Выдели внутренний метод `_send_and_extract_json(self, payload: dict) -> dict`, который выполняет HTTP-запрос к Gemini API (с заголовком `x-goog-api-key`) и возвращает распарсенный `dict`, после чего `_send_and_parse` вызывает `parse_food_result(parsed_json)`, а `generate_meal_plan` вызывает `parse_meal_plan_result(parsed_json, expected_count, max_calories)`.
3. Добавь методы `analyze_food_voice` и `generate_meal_plan` в класс `GeminiProvider`:

```python
    async def analyze_food_voice(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/ogg",
    ) -> FoodAnalysisResult:
        if not self.api_key:
            raise AIAuthenticationError("Gemini API key is not configured")

        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        prompt = build_voice_prompt()

        # Нормализуем MIME-тип аудио для Gemini API
        clean_mime = mime_type.split(";")[0].strip().lower()
        if clean_mime not in {"audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/wav"}:
            clean_mime = "audio/ogg"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": clean_mime,
                                "data": b64_audio,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        return await self._send_and_parse(payload)

    async def generate_meal_plan(
        self,
        prompt: str,
        expected_count: int,
        max_calories: float,
    ) -> list[PlannedMealItem]:
        if not self.api_key:
            raise AIAuthenticationError("Gemini API key is not configured")

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "responseMimeType": "application/json",
            },
        }

        parsed_json = await self._send_and_extract_json(payload)
        return parse_meal_plan_result(parsed_json, expected_count=expected_count, max_calories=max_calories)
```

#### 4.3. Обнови `backend/app/utils/ai_providers/openrouter.py`

Аналогично в `backend/app/utils/ai_providers/openrouter.py`:
1. Импортируй `build_voice_prompt`, `parse_meal_plan_result`, `PlannedMealItem`.
2. Выдели `_send_and_extract_json(self, payload: Dict[str, Any]) -> Dict[str, Any]`.
3. Добавь методы `analyze_food_voice` и `generate_meal_plan` в `OpenRouterProvider`:

```python
    async def analyze_food_voice(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/ogg",
    ) -> FoodAnalysisResult:
        if not self.api_key:
            raise AIAuthenticationError("OpenRouter API key is not configured")

        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        prompt = build_voice_prompt()

        clean_mime = mime_type.split(";")[0].strip().lower()
        audio_format = "ogg"
        if "wav" in clean_mime:
            audio_format = "wav"
        elif "mp3" in clean_mime or "mpeg" in clean_mime:
            audio_format = "mp3"
        elif "webm" in clean_mime:
            audio_format = "webm"
        elif "mp4" in clean_mime or "m4a" in clean_mime:
            audio_format = "m4a"

        payload: Dict[str, Any] = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": b64_audio,
                                "format": audio_format,
                            },
                        },
                    ],
                }
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        return await self._send_and_parse(payload)

    async def generate_meal_plan(
        self,
        prompt: str,
        expected_count: int,
        max_calories: float,
    ) -> list[PlannedMealItem]:
        if not self.api_key:
            raise AIAuthenticationError("OpenRouter API key is not configured")

        payload: Dict[str, Any] = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "temperature": 0.4,
            "response_format": {"type": "json_object"},
        }

        parsed_json = await self._send_and_extract_json(payload)
        return parse_meal_plan_result(parsed_json, expected_count=expected_count, max_calories=max_calories)
```

#### 4.4. Обнови `backend/app/services/ai_router.py`

Добавь в класс `AIRouter` (`backend/app/services/ai_router.py`) два новых метода, которые идут строго по цепочке моделей и приоритетам, выставленным пользователем:
1. `recognize_food_by_voice(...) -> Tuple[FoodAnalysisResult, str, str]`
2. `generate_meal_plan(...) -> Tuple[List[PlannedMealItem], str, str]`

```python
    async def recognize_food_by_voice(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/ogg",
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[FoodAnalysisResult, str, str]:
        """
        Execute voice food recognition & transcription across the user's priority model chain.
        Returns (result, provider_name, model_id).
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        for provider_type, model_id in chain_to_use:
            provider = self._get_provider_instance(
                provider_type,
                model_id,
                gemini_key=custom_gemini_key,
                openrouter_key=custom_openrouter_key,
            )
            if not provider:
                continue

            logger.info(f"Attempting voice food recognition using {provider_type} / {model_id}...")

            for attempt in range(1, 3):
                try:
                    result = await provider.analyze_food_voice(
                        audio_bytes=audio_bytes,
                        mime_type=mime_type,
                    )
                    logger.info(
                        f"Successfully recognized voice food using {provider_type}/{model_id} (attempt {attempt}): {result.name}"
                    )
                    return result, provider_type, model_id
                except (AIAuthenticationError, AIRateLimitError) as err:
                    logger.warning(f"Failover on {provider_type}/{model_id}: {err}")
                    errors_collected.append(f"{provider_type}/{model_id}: {err}")
                    break
                except AIProviderError as err:
                    logger.warning(f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}")
                    errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")
                    err_str = str(err).lower()
                    if any(term in err_str for term in ["high demand", "503", "unavailable", "заблокирован", "not supported", "audio", "modality", "resource_exhausted"]):
                        break
                    if attempt == 1:
                        await asyncio.sleep(2)
                except Exception as ex:
                    logger.error(f"Unexpected error in {provider_type}/{model_id}: {ex}", exc_info=True)
                    errors_collected.append(f"{provider_type}/{model_id}: {ex}")
                    break

        logger.error(f"All AI models failed for voice recognition: {errors_collected}")
        raise AllProvidersFailedError(
            "Не удалось распознать голосовое сообщение через AI. Попробуйте описать блюдо текстом."
        )

    async def generate_meal_plan(
        self,
        prompt: str,
        expected_count: int,
        max_calories: float,
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[ list, str, str ]:
        """
        Generate daily meal plan across the user's priority model chain.
        Returns (planned_meals_list, provider_name, model_id).
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        for provider_type, model_id in chain_to_use:
            provider = self._get_provider_instance(
                provider_type,
                model_id,
                gemini_key=custom_gemini_key,
                openrouter_key=custom_openrouter_key,
            )
            if not provider:
                continue

            logger.info(f"Attempting meal plan generation using {provider_type} / {model_id}...")

            for attempt in range(1, 3):
                try:
                    meals_list = await provider.generate_meal_plan(
                        prompt=prompt,
                        expected_count=expected_count,
                        max_calories=max_calories,
                    )
                    logger.info(
                        f"Successfully generated {len(meals_list)} meals using {provider_type}/{model_id}"
                    )
                    return meals_list, provider_type, model_id
                except (AIAuthenticationError, AIRateLimitError) as err:
                    logger.warning(f"Failover on {provider_type}/{model_id}: {err}")
                    errors_collected.append(f"{provider_type}/{model_id}: {err}")
                    break
                except AIProviderError as err:
                    logger.warning(f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}")
                    errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")
                    err_str = str(err).lower()
                    if any(term in err_str for term in ["high demand", "503", "unavailable", "заблокирован", "not supported", "resource_exhausted"]):
                        break
                    if attempt == 1:
                        await asyncio.sleep(2)
                except Exception as ex:
                    logger.error(f"Unexpected error in {provider_type}/{model_id}: {ex}", exc_info=True)
                    errors_collected.append(f"{provider_type}/{model_id}: {ex}")
                    break

        logger.error(f"All AI models failed for meal plan generation: {errors_collected}")
        raise AllProvidersFailedError(
            "Все модели AI в данный момент перегружены или недоступны. Попробуйте нажать кнопку генерации ещё раз через несколько секунд."
        )
```

---

### Шаг 5. Голосовой эндпоинт `POST /api/ai/recognize-voice` в `backend/app/routers/ai.py`

В `backend/app/routers/ai.py` добавь эндпоинт голосового распознавания:

```python
@router.post("/recognize-voice", response_model=FoodRecognitionResponse)
async def recognize_food_voice_endpoint(
    audio: UploadFile = File(..., description="Голосовое сообщение пользователя (OGG, WebM, MP4, WAV, MP3)"),
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
):
    """
    Recognize food and transcribe voice audio description using AI.
    Returns structured KBJU, ingredients, and verbatim text transcription (to store in user_comment).
    """
    check_ai_rate_limit(current_user.id)

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Аудиофайл пуст",
        )
    if len(audio_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Размер голосового сообщения превышает 10 МБ",
        )

    mime_type = (audio.content_type or "audio/ogg").lower()

    custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
        current_user=current_user,
        x_gemini_key=x_gemini_key,
        x_openrouter_key=x_openrouter_key,
        x_ai_models=x_ai_models,
    )

    try:
        result, provider_name, model_id = await ai_router.recognize_food_by_voice(
            audio_bytes=audio_bytes,
            mime_type=mime_type,
            custom_gemini_key=custom_gemini,
            custom_openrouter_key=custom_openrouter,
            custom_model_chain=custom_chain,
        )
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Voice AI error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при обработке голосового сообщения",
        )

    return FoodRecognitionResponse(
        name=result.name,
        weight_grams=result.weight_grams,
        calories=result.calories,
        protein=result.protein,
        fat=result.fat,
        carbs=result.carbs,
        confidence=result.confidence,
        photo_path=None,
        transcription=result.transcription or result.name,
        provider_used=provider_name,
        model_used=model_id,
        raw_response=result.raw_response,
        ingredients=result.ingredients,
    )
```

---

### Шаг 6. Роутер генератора меню `backend/app/routers/meal_plan.py` (ФИЧА 1)

Создай файл `backend/app/routers/meal_plan.py`:
- `GET /api/meal-plan?date=YYYY-MM-DD`: возвращает сохранённое меню пользователя на выбранный день (если оно уже генерировалось), чтобы при перезагрузке страницы или повторном входе на сайт всё сохранялось.
- `POST /api/meal-plan/generate`: генерирует новое меню ИЛИ перегенерирует только незакреплённые блюда (`meals_count - len(locked_meals)`), строго вычитая калории закреплённых блюд из лимита `target_calories`, чтобы сумма всех блюд никогда не превысила установленную пользователем калорийность! Автоматически сохраняет результат в таблицу `meal_plans`.
- `PUT /api/meal-plan/save`: сохраняет изменения состояния карточек (например, когда пользователь отметил `locked` или нажал «Добавить в съеденное» -> `added_to_diary = True`).

```python
import json
import logging
from datetime import date as dt_date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.user import User
from app.models.meal import Meal
from app.models.recipe import Recipe
from app.models.scanned_product import UserScannedProduct
from app.models.product import Product
from app.models.meal_plan import MealPlan
from app.schemas.ai import (
    PlannedMealItem,
    MealPlanGenerateRequest,
    MealPlanSaveRequest,
    MealPlanResponse,
)
from app.services.auth import get_current_user
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.utils.ai_providers.base import build_meal_plan_prompt
from app.routers.ai import check_ai_rate_limit, resolve_ai_config

logger = logging.getLogger("kalorii.meal_plan")
router = APIRouter(prefix="/meal-plan", tags=["Планировщик меню (Что съесть)"])


def _build_plan_response(plan: MealPlan) -> MealPlanResponse:
    meals_items = [PlannedMealItem(**m) for m in plan.meals]
    total_cal = round(sum(m.calories for m in meals_items), 1)
    total_prot = round(sum(m.protein for m in meals_items), 1)
    total_fat = round(sum(m.fat for m in meals_items), 1)
    total_carbs = round(sum(m.carbs for m in meals_items), 1)

    return MealPlanResponse(
        id=plan.id,
        plan_date=plan.plan_date,
        meals_count=plan.meals_count,
        target_calories=plan.target_calories,
        target_protein=plan.target_protein,
        target_fat=plan.target_fat,
        target_carbs=plan.target_carbs,
        user_preferences=plan.user_preferences,
        total_generated_calories=total_cal,
        total_generated_protein=total_prot,
        total_generated_fat=total_fat,
        total_generated_carbs=total_carbs,
        meals=meals_items,
        provider_used=plan.provider_used,
        model_used=plan.model_used,
        updated_at=plan.updated_at,
    )


async def _collect_user_food_hints(db: AsyncSession, user_id: int) -> Optional[str]:
    """Collect up to 15 favorite/frequent items from user's meals, recipes, and scanned products."""
    names: List[str] = []
    try:
        rec_res = await db.execute(
            select(Recipe.name)
            .where(Recipe.user_id == user_id)
            .order_by(Recipe.is_favorite.desc(), Recipe.created_at.desc())
            .limit(6)
        )
        names.extend(r for r in rec_res.scalars().all() if r)

        scan_res = await db.execute(
            select(Product.name)
            .join(UserScannedProduct, UserScannedProduct.product_id == Product.id)
            .where(UserScannedProduct.user_id == user_id)
            .order_by(UserScannedProduct.scan_count.desc())
            .limit(6)
        )
        names.extend(s for s in scan_res.scalars().all() if s)

        meal_res = await db.execute(
            select(Meal.name)
            .where(Meal.user_id == user_id)
            .order_by(Meal.created_at.desc())
            .limit(10)
        )
        for m in meal_res.scalars().all():
            if m and m not in names:
                names.append(m)
    except Exception:
        pass

    unique_names = list(dict.fromkeys(names))[:15]
    return ", ".join(unique_names) if unique_names else None


@router.get("", response_model=Optional[MealPlanResponse])
async def get_meal_plan(
    date: Optional[dt_date] = Query(None, description="Дата плана YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve saved generated meal plan for a specific date (returns null if none exists yet)."""
    target_date = date or dt_date.today()
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == target_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()
    if not plan:
        return None
    return _build_plan_response(plan)


@router.post("/generate", response_model=MealPlanResponse)
async def generate_meal_plan_endpoint(
    req: MealPlanGenerateRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate or partially regenerate a daily meal plan using the user's priority AI model cascade.
    Strictly enforces that total calories (locked + newly generated) do not exceed req.target_calories.
    Persists the resulting plan in the database so it survives page reloads.
    """
    check_ai_rate_limit(current_user.id)

    locked = [m for m in req.locked_meals if m.locked][: req.meals_count]
    meals_to_generate = max(0, req.meals_count - len(locked))

    # Если все блюда закреплены, просто сохраняем и возвращаем текущий список
    if meals_to_generate == 0:
        final_meals = locked
        prov_used, mod_used = "local", "locked"
    else:
        locked_cal = sum(m.calories for m in locked)
        locked_prot = sum(m.protein for m in locked)
        locked_fat = sum(m.fat for m in locked)
        locked_carbs = sum(m.carbs for m in locked)

        remaining_cal = max(100.0, req.target_calories - locked_cal)
        remaining_prot = max(5.0, req.target_protein - locked_prot)
        remaining_fat = max(5.0, req.target_fat - locked_fat)
        remaining_carbs = max(5.0, req.target_carbs - locked_carbs)

        fav_hints = await _collect_user_food_hints(db, current_user.id)
        locked_names = [m.name for m in locked] if locked else None

        prompt = build_meal_plan_prompt(
            meals_to_generate=meals_to_generate,
            max_calories=remaining_cal,
            target_protein=remaining_prot,
            target_fat=remaining_fat,
            target_carbs=remaining_carbs,
            user_preferences=req.user_preferences,
            locked_meal_names=locked_names,
            favorite_products_hint=fav_hints,
        )

        custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
            current_user=current_user,
            x_gemini_key=x_gemini_key,
            x_openrouter_key=x_openrouter_key,
            x_ai_models=x_ai_models,
        )

        try:
            generated_meals, prov_used, mod_used = await ai_router.generate_meal_plan(
                prompt=prompt,
                expected_count=meals_to_generate,
                max_calories=remaining_cal,
                custom_gemini_key=custom_gemini,
                custom_openrouter_key=custom_openrouter,
                custom_model_chain=custom_chain,
            )
        except AllProvidersFailedError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            )
        except Exception as e:
            logger.error(f"Error generating meal plan: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ошибка при генерации меню через AI",
            )

        final_meals = locked + generated_meals
        # Нумеруем подписи приёмов пищи аккуратно по порядку
        for i, m in enumerate(final_meals):
            if not m.meal_label or m.meal_label.startswith("Приём пищи"):
                m.meal_label = f"Приём пищи {i + 1}"

    # Upsert в таблицу meal_plans
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == req.plan_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()

    meals_dump = [m.model_dump() for m in final_meals]

    if plan:
        plan.meals_count = req.meals_count
        plan.target_calories = round(req.target_calories, 1)
        plan.target_protein = round(req.target_protein, 1)
        plan.target_fat = round(req.target_fat, 1)
        plan.target_carbs = round(req.target_carbs, 1)
        plan.user_preferences = req.user_preferences
        plan.meals = meals_dump
        plan.provider_used = prov_used
        plan.model_used = mod_used
    else:
        plan = MealPlan(
            user_id=current_user.id,
            plan_date=req.plan_date,
            meals_count=req.meals_count,
            target_calories=round(req.target_calories, 1),
            target_protein=round(req.target_protein, 1),
            target_fat=round(req.target_fat, 1),
            target_carbs=round(req.target_carbs, 1),
            user_preferences=req.user_preferences,
            meals_json=json.dumps(meals_dump, ensure_ascii=False),
            provider_used=prov_used,
            model_used=mod_used,
        )
        db.add(plan)

    try:
        await db.commit()
        await db.refresh(plan)
    except Exception as e:
        await db.rollback()
        logger.error(f"Error saving generated meal plan: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить сгенерированное меню",
        )

    return _build_plan_response(plan)


@router.put("/save", response_model=MealPlanResponse)
async def save_meal_plan_state(
    req: MealPlanSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save updated state of a meal plan (e.g. locked flags, added_to_diary flags, or edited targets)."""
    stmt = select(MealPlan).where(
        and_(
            MealPlan.user_id == current_user.id,
            MealPlan.plan_date == req.plan_date,
        )
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()

    meals_dump = [m.model_dump() for m in req.meals]

    if plan:
        plan.meals_count = req.meals_count
        plan.target_calories = round(req.target_calories, 1)
        plan.target_protein = round(req.target_protein, 1)
        plan.target_fat = round(req.target_fat, 1)
        plan.target_carbs = round(req.target_carbs, 1)
        plan.user_preferences = req.user_preferences
        plan.meals = meals_dump
    else:
        plan = MealPlan(
            user_id=current_user.id,
            plan_date=req.plan_date,
            meals_count=req.meals_count,
            target_calories=round(req.target_calories, 1),
            target_protein=round(req.target_protein, 1),
            target_fat=round(req.target_fat, 1),
            target_carbs=round(req.target_carbs, 1),
            user_preferences=req.user_preferences,
            meals_json=json.dumps(meals_dump, ensure_ascii=False),
        )
        db.add(plan)

    await db.commit()
    await db.refresh(plan)
    return _build_plan_response(plan)
```

---

### Шаг 7. Сервис и роутер двустороннего Telegram-бота (`telegram_bot.py` и `routers/telegram.py`) (ФИЧА 2)

#### 7.1. Создай роутер привязки `backend/app/routers/telegram.py`

Позволяет пользователю на сайте сгенерировать код привязки Telegram-бота, проверить статус подключения и отвязать бота:

```python
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
```

#### 7.2. Создай сервис `backend/app/services/telegram_bot.py`

Сервис реализует всю логику Telegram-бота через `httpx.AsyncClient` (без сторонних конфликтующих зависимостей):
1. **Привязка пользователя**: по команде `/start KLR-XXXXXX` или просто отправке кода `KLR-XXXXXX` в чат.
2. **Обработка любого фото + текста (`caption`)**: скачивает фото с серверов Telegram, прогоняет через `process_image`, сохраняет в `/uploads/{uuid}.jpg`, распознаёт блюдо через `ai_router.recognize_food` (с учётом настроек и приоритетов моделей пользователя!) и сохраняет `Meal` в БД с фото и `user_comment = caption`.
3. **Обработка любого текста (не команды)**: распознаёт через `ai_router.recognize_food_by_text` и сохраняет `Meal` в БД с `user_comment = text`.
4. **Обработка любого голосового сообщения (`voice` / `audio`)**: скачивает `.ogg` файл, распознаёт через `ai_router.recognize_food_by_voice`, сохраняет `Meal` в БД и **помещает текстовую транскрибацию (`result.transcription`) в поле `Meal.user_comment`** — чтобы на сайте это описание сразу отображалось в карточке блюда и было доступно для свободного редактирования и повторного AI-пересчёта!
5. **Кнопка удаления под сообщением бота (`callback_query` `del_meal:{id}`)**: если пользователь случайно отправил не то сообщение, он может удалить запись прямо из Telegram в один тап.

```python
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
```

---

### Шаг 8. Подключение новых таблиц, роутеров и Telegram-поллинга в `backend/app/main.py`

В `backend/app/main.py`:
1. Импортируй новые роутеры и сервис:
   ```python
   from app.routers import auth, meals, products, recipes, stats, profile, ai, barcode, meal_plan, telegram
   from app.services.telegram_bot import telegram_bot_service
   ```
2. Внутри `lifespan` в список `for alter_sql in [...]` добавь:
   ```python
   "ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT",
   "ALTER TABLE users ADD COLUMN telegram_username VARCHAR(100)",
   "ALTER TABLE users ADD COLUMN telegram_link_code VARCHAR(64)",
   "ALTER TABLE users ADD COLUMN telegram_link_expires_at DATETIME",
   ```
3. Перед `yield` в `lifespan` запусти поллинг Telegram-бота:
   ```python
   tg_task = asyncio.create_task(telegram_bot_service.start_polling())
   ```
   А после `yield` (при остановке):
   ```python
   telegram_bot_service.stop()
   tg_task.cancel()
   ```
4. Зарегистрируй роутеры:
   ```python
   app.include_router(meal_plan.router, prefix=settings.API_V1_PREFIX)
   app.include_router(telegram.router, prefix=settings.API_V1_PREFIX)
   ```

---

## ЧАСТЬ Б. Изменения на стороне Фронтенда (React 19 + TypeScript + Zustand + UI)

### Шаг 9. Типы TypeScript в `frontend/src/types/index.ts`

В `frontend/src/types/index.ts`:
1. В интерфейс `AIRecognitionResult` добавь поле `transcription?: string | null`.
2. В конец файла добавь интерфейсы для генератора меню и Telegram-бота:

```ts
export interface PlannedMealItem {
  id: string
  meal_label: string
  name: string
  weight_grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  ingredients: MealIngredient[]
  locked: boolean
  added_to_diary?: boolean
}

export interface MealPlanGeneratePayload {
  plan_date: string
  meals_count: number
  target_calories: number
  target_protein: number
  target_fat: number
  target_carbs: number
  user_preferences?: string | null
  locked_meals?: PlannedMealItem[]
}

export interface MealPlanResponse {
  id?: number | null
  plan_date: string
  meals_count: number
  target_calories: number
  target_protein: number
  target_fat: number
  target_carbs: number
  user_preferences?: string | null
  total_generated_calories: number
  total_generated_protein: number
  total_generated_fat: number
  total_generated_carbs: number
  meals: PlannedMealItem[]
  provider_used?: string | null
  model_used?: string | null
  updated_at?: string | null
}

export interface TelegramStatusResponse {
  is_linked: boolean
  telegram_username?: string | null
  telegram_chat_id?: number | null
  bot_username?: string | null
  link_code?: string | null
  deep_link_url?: string | null
  expires_at?: string | null
}
```

---

### Шаг 10. Клиентские API-модули (`ai.ts`, `mealPlan.ts`, `telegram.ts`)

#### 10.1. В `frontend/src/api/ai.ts` добавь метод `recognizeVoice`:

```ts
  async recognizeVoice(audioBlob: Blob, filename = 'voice.webm'): Promise<AIRecognitionResult> {
    const formData = new FormData()
    formData.append('audio', audioBlob, filename)

    const headers = getAIHeaders()

    return apiClient<AIRecognitionResult>('/ai/recognize-voice', {
      method: 'POST',
      body: formData,
      headers,
    })
  },
```

#### 10.2. Создай файл `frontend/src/api/mealPlan.ts`:

```ts
import { apiClient } from './client'
import { getAIHeaders } from './ai'
import { MealPlanGeneratePayload, MealPlanResponse, PlannedMealItem } from '../types'

export const mealPlanApi = {
  async getPlan(date: string): Promise<MealPlanResponse | null> {
    return apiClient<MealPlanResponse | null>(`/meal-plan?date=${encodeURIComponent(date)}`, {
      method: 'GET',
    })
  },

  async generatePlan(payload: MealPlanGeneratePayload): Promise<MealPlanResponse> {
    return apiClient<MealPlanResponse>('/meal-plan/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: getAIHeaders(),
    })
  },

  async savePlanState(payload: {
    plan_date: string
    meals_count: number
    target_calories: number
    target_protein: number
    target_fat: number
    target_carbs: number
    user_preferences?: string | null
    meals: PlannedMealItem[]
  }): Promise<MealPlanResponse> {
    return apiClient<MealPlanResponse>('/meal-plan/save', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
}
```

#### 10.3. Создай файл `frontend/src/api/telegram.ts`:

```ts
import { apiClient } from './client'
import { TelegramStatusResponse } from '../types'

export const telegramApi = {
  async getStatus(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/status', {
      method: 'GET',
    })
  },

  async generateLinkCode(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/link-code', {
      method: 'POST',
    })
  },

  async unlink(): Promise<TelegramStatusResponse> {
    return apiClient<TelegramStatusResponse>('/telegram/unlink', {
      method: 'DELETE',
    })
  },
}
```

---

### Шаг 11. Обновление `frontend/src/store/mealsStore.ts` для голосового ввода с сохранением транскрибации в `user_comment`

В `frontend/src/store/mealsStore.ts`:
1. В интерфейс `PendingAIMeal` в `frontend/src/types/index.ts` добавь тип `'voice'`:
   `type: 'photo' | 'text' | 'voice'` и `audioBlob?: Blob`.
2. В `MealsState` (`frontend/src/store/mealsStore.ts`) добавь сигнатуру:
   ```ts
   startVoiceAIAnalysis: (
     audioBlob: Blob,
     targetDate?: string,
     targetTime?: string
   ) => void
   ```
3. Реализуй `startVoiceAIAnalysis` в `useMealsStore`:

```ts
  startVoiceAIAnalysis: (
    audioBlob: Blob,
    targetDate?: string,
    targetTime?: string
  ) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const date = targetDate || get().selectedDate
    const time = targetTime || new Date().toTimeString().slice(0, 5)

    const pendingItem: PendingAIMeal = {
      id,
      type: 'voice',
      audioBlob,
      textDescription: '🎤 Расшифровка голосового описания...',
      targetDate: date,
      targetTime: time,
      status: 'analyzing',
      createdAt: Date.now(),
    }

    set((state) => ({
      pendingMeals: [pendingItem, ...state.pendingMeals],
    }))

    ;(async () => {
      try {
        const result = await aiApi.recognizeVoice(audioBlob)
        // Помещаем расшифрованный текст речи в user_comment (описание продукта),
        // чтобы пользователь на сайте мог свободно его редактировать и пересчитывать через AI!
        const transcriptionComment = (result.transcription || result.name || '').trim()

        const newMeal = await mealsApi.createMeal({
          name: result.name || 'Блюдо (голос)',
          calories: Math.round(result.calories || 0),
          protein: Math.round((result.protein || 0) * 10) / 10,
          fat: Math.round((result.fat || 0) * 10) / 10,
          carbs: Math.round((result.carbs || 0) * 10) / 10,
          weight_grams: result.weight_grams ? Math.round(result.weight_grams) : undefined,
          photo_path: null,
          user_comment: transcriptionComment || null,
          ai_raw_response:
            result.raw_response || (result.model_used ? `Model: ${result.model_used}` : 'AI Voice'),
          ingredients: result.ingredients || [],
          meal_date: date,
          meal_time: time,
          is_manually_edited: false,
        })

        set((state) => ({
          pendingMeals: state.pendingMeals.filter((p) => p.id !== id),
        }))

        if (newMeal.meal_date === get().selectedDate) {
          set((state) => {
            const exists = state.meals.some((m) => m.id === newMeal.id)
            const updatedMeals = sortMealsByTime(exists ? state.meals : [newMeal, ...state.meals])
            return {
              meals: updatedMeals,
              dailySummary: computeUpdatedSummary(state.dailySummary, updatedMeals),
            }
          })
        }

        useUIStore
          .getState()
          .addToast(
            `🎤 "${newMeal.name}" (${Math.round(newMeal.calories)} ккал) распознано и добавлено!`,
            'success',
            4500
          )
      } catch (err: any) {
        const errMsg = err.message || 'Ошибка распознавания голосового сообщения'
        set((state) => ({
          pendingMeals: state.pendingMeals.map((p) =>
            p.id === id ? { ...p, status: 'error', errorMessage: errMsg } : p
          ),
        }))
        useUIStore.getState().addToast(errMsg, 'error', 5000)
      }
    })()
  },
```
*(Также в `retryPendingMeal` добавь ветку `else if (item.type === 'voice' && item.audioBlob) { result = await aiApi.recognizeVoice(item.audioBlob) }` и сохранение `user_comment: result.transcription || item.textDescription || null`).*

---

### Шаг 12. Стор планировщика меню `frontend/src/store/mealPlanStore.ts` (ФИЧА 1)

Создай файл `frontend/src/store/mealPlanStore.ts`. Он обеспечивает двойную персистентность: мгновенно кэширует планы по датам в `localStorage` (`kalorii_meal_plans_cache`) и синхронизирует их с БД на сервере (`/api/meal-plan`), поэтому сгенерированное меню никогда не пропадает при перезагрузке страницы или закрытии сайта:

```ts
import { create } from 'zustand'
import { MealPlanResponse, PlannedMealItem } from '../types'
import { mealPlanApi } from '../api/mealPlan'
import { getTodayDateString } from './mealsStore'
import { useUIStore } from './uiStore'

const CACHE_KEY = 'kalorii_meal_plans_cache'

function loadLocalPlansCache(): Record<string, MealPlanResponse> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {}
  return {}
}

function saveLocalPlansCache(plans: Record<string, MealPlanResponse>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(plans))
  } catch {}
}

interface MealPlanState {
  planDate: string
  plansByDate: Record<string, MealPlanResponse>
  isLoading: boolean
  isGenerating: boolean
  error: string | null

  setPlanDate: (date: string) => void
  fetchPlanForDate: (date: string) => Promise<MealPlanResponse | null>
  generatePlan: (params: {
    planDate: string
    mealsCount: number
    targetCalories: number
    targetProtein: number
    targetFat: number
    targetCarbs: number
    userPreferences?: string
    onlyUnlocked?: boolean
  }) => Promise<MealPlanResponse>
  toggleLockMeal: (planDate: string, mealId: string) => Promise<void>
  markMealAddedToDiary: (planDate: string, mealId: string) => Promise<void>
}

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  planDate: getTodayDateString(),
  plansByDate: loadLocalPlansCache(),
  isLoading: false,
  isGenerating: false,
  error: null,

  setPlanDate: (date: string) => {
    set({ planDate: date })
    get().fetchPlanForDate(date)
  },

  fetchPlanForDate: async (date: string) => {
    set({ isLoading: true, error: null })
    try {
      const serverPlan = await mealPlanApi.getPlan(date)
      if (serverPlan) {
        set((state) => {
          const next = { ...state.plansByDate, [date]: serverPlan }
          saveLocalPlansCache(next)
          return { plansByDate: next, isLoading: false }
        })
        return serverPlan
      }
      set({ isLoading: false })
      return get().plansByDate[date] || null
    } catch {
      set({ isLoading: false })
      return get().plansByDate[date] || null
    }
  },

  generatePlan: async ({
    planDate,
    mealsCount,
    targetCalories,
    targetProtein,
    targetFat,
    targetCarbs,
    userPreferences,
    onlyUnlocked = false,
  }) => {
    set({ isGenerating: true, error: null })
    try {
      const existingPlan = get().plansByDate[planDate]
      const lockedMeals =
        onlyUnlocked && existingPlan
          ? existingPlan.meals.filter((m) => m.locked)
          : []

      const generated = await mealPlanApi.generatePlan({
        plan_date: planDate,
        meals_count: mealsCount,
        target_calories: targetCalories,
        target_protein: targetProtein,
        target_fat: targetFat,
        target_carbs: targetCarbs,
        user_preferences: userPreferences?.trim() || null,
        locked_meals: lockedMeals,
      })

      set((state) => {
        const next = { ...state.plansByDate, [planDate]: generated }
        saveLocalPlansCache(next)
        return { plansByDate: next, isGenerating: false }
      })

      useUIStore
        .getState()
        .addToast('✨ Меню успешно сгенерировано и сохранено!', 'success', 3500)
      return generated
    } catch (err: any) {
      const msg = err.message || 'Ошибка генерации меню через AI'
      set({ error: msg, isGenerating: false })
      useUIStore.getState().addToast(msg, 'error', 4500)
      throw err
    }
  },

  toggleLockMeal: async (planDate: string, mealId: string) => {
    const plan = get().plansByDate[planDate]
    if (!plan) return

    const updatedMeals = plan.meals.map((m) =>
      m.id === mealId ? { ...m, locked: !m.locked } : m
    )
    const optimistic: MealPlanResponse = { ...plan, meals: updatedMeals }

    set((state) => {
      const next = { ...state.plansByDate, [planDate]: optimistic }
      saveLocalPlansCache(next)
      return { plansByDate: next }
    })

    try {
      await mealPlanApi.savePlanState({
        plan_date: planDate,
        meals_count: plan.meals_count,
        target_calories: plan.target_calories,
        target_protein: plan.target_protein,
        target_fat: plan.target_fat,
        target_carbs: plan.target_carbs,
        user_preferences: plan.user_preferences,
        meals: updatedMeals,
      })
    } catch {}
  },

  markMealAddedToDiary: async (planDate: string, mealId: string) => {
    const plan = get().plansByDate[planDate]
    if (!plan) return

    const updatedMeals = plan.meals.map((m) =>
      m.id === mealId ? { ...m, added_to_diary: true } : m
    )
    const optimistic: MealPlanResponse = { ...plan, meals: updatedMeals }

    set((state) => {
      const next = { ...state.plansByDate, [planDate]: optimistic }
      saveLocalPlansCache(next)
      return { plansByDate: next }
    })

    try {
      await mealPlanApi.savePlanState({
        plan_date: planDate,
        meals_count: plan.meals_count,
        target_calories: plan.target_calories,
        target_protein: plan.target_protein,
        target_fat: plan.target_fat,
        target_carbs: plan.target_carbs,
        user_preferences: plan.user_preferences,
        meals: updatedMeals,
      })
    } catch {}
  },
}))
```

---

### Шаг 13. Страница новой вкладки «Что съесть» (`frontend/src/pages/MealPlanPage.tsx`) (ФИЧА 1)

Создай файл `frontend/src/pages/MealPlanPage.tsx`.
Логика работы страницы в точности соответствует требованиям пользователя:
1. Сверху — выбор дня, к которому планируется питание (по умолчанию выбрано **Сегодня**, есть быстрые кнопки «Сегодня», «Завтра» и выбор любой даты).
2. При выборе дня автоматически запрашивается `mealsApi.getMeals(planDate)` и вычисляется **остаток КБЖУ пользователя на этот день** (`Норма - Уже съедено`), который сам подставляется в поля формы (если план на этот день ещё не был сохранён). При этом пользователь может свободно редактировать любые поля (`Калории`, `Белки`, `Жиры`, `Углеводы`) и выбирать количество блюд (`1..5`).
3. Чётко указано, что главный приоритет — **не превысить указанный потолок калорийности**.
4. При нажатии кнопки генерации запросы идут по цепочке моделей из настроек пользователя.
5. Сгенерированный результат автоматически сохраняется в БД и `localStorage` — при перезагрузке страницы или повторном входе на сайт все карточки блюд остаются на месте.
6. На каждой карточке блюда есть:
   - Список простых ингредиентов (состав с граммовками и КБЖУ).
   - Кнопка **«📌 Оставить блюдо»** (`locked`). Если пользователь закрепил одно или несколько блюд, появляется кнопка **«🔄 Перегенерировать остальные (оставив выбранные)»**, а также кнопка **«Сгенерировать всё меню заново»**.
   - Кнопка **«✅ Добавить в съеденное»** — одним нажатием переносит выбранное блюдо (вместе с его составом `ingredients`) в дневник питания за этот день. Само по себе блюдо без нажатия кнопки в дневник не попадает.

```tsx
import React, { useState, useEffect } from 'react'
import {
  ChefHat,
  Sparkles,
  Calendar,
  Pin,
  RefreshCw,
  Check,
  Plus,
  Layers,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMealsStore, getTodayDateString } from '../store/mealsStore'
import { useMealPlanStore } from '../store/mealPlanStore'
import { useUIStore } from '../store/uiStore'
import { mealsApi } from '../api/meals'
import { PlannedMealItem } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { pluralizeRu } from '../utils/pluralize'

function getTomorrowDateString(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const MealPlanPage: React.FC = () => {
  const { user } = useAuthStore()
  const { addMeal } = useMealsStore()
  const { addToast } = useUIStore()
  const {
    planDate,
    plansByDate,
    isGenerating,
    setPlanDate,
    fetchPlanForDate,
    generatePlan,
    toggleLockMeal,
    markMealAddedToDiary,
  } = useMealPlanStore()

  const todayStr = getTodayDateString()
  const tomorrowStr = getTomorrowDateString()

  const currentPlan = plansByDate[planDate] || null

  // Параметры формы генерации
  const [mealsCount, setMealsCount] = useState<number>(3)
  const [targetCalories, setTargetCalories] = useState<string>('1500')
  const [targetProtein, setTargetProtein] = useState<string>('110')
  const [targetFat, setTargetFat] = useState<string>('50')
  const [targetCarbs, setTargetCarbs] = useState<string>('160')
  const [preferences, setPreferences] = useState<string>('')

  // Информация о съеденном за выбранный день для подсказки остатка
  const [eatenStats, setEatenStats] = useState<{
    calories: number
    protein: number
    fat: number
    carbs: number
  }>({ calories: 0, protein: 0, fat: 0, carbs: 0 })

  const [addingMealId, setAddingMealId] = useState<string | null>(null)

  const goalCal = user?.daily_calories_goal || 2000
  const goalProt = user?.daily_protein_goal || 140
  const goalFat = user?.daily_fat_goal || 70
  const goalCarbs = user?.daily_carbs_goal || 250

  // Подгружаем сохранённый план и остаток КБЖУ при смене даты
  useEffect(() => {
    let active = true

    async function loadDayContext() {
      const savedPlan = await fetchPlanForDate(planDate)
      try {
        const daySummary = await mealsApi.getMeals(planDate)
        if (!active) return

        const eatenCal = Math.round(daySummary.total_calories || 0)
        const eatenProt = Math.round(daySummary.total_protein || 0)
        const eatenFat = Math.round(daySummary.total_fat || 0)
        const eatenCarbs = Math.round(daySummary.total_carbs || 0)

        setEatenStats({
          calories: eatenCal,
          protein: eatenProt,
          fat: eatenFat,
          carbs: eatenCarbs,
        })

        // Если на этот день уже есть сохранённый план, подставляем его настройки
        if (savedPlan) {
          setMealsCount(savedPlan.meals_count || 3)
          setTargetCalories(String(Math.round(savedPlan.target_calories)))
          setTargetProtein(String(Math.round(savedPlan.target_protein)))
          setTargetFat(String(Math.round(savedPlan.target_fat)))
          setTargetCarbs(String(Math.round(savedPlan.target_carbs)))
          setPreferences(savedPlan.user_preferences || '')
        } else {
          // Автоматически подставляем остаток КБЖУ пользователя на выбранный день
          const remCal = Math.max(0, goalCal - eatenCal)
          const remProt = Math.max(0, goalProt - eatenProt)
          const remFat = Math.max(0, goalFat - eatenFat)
          const remCarbs = Math.max(0, goalCarbs - eatenCarbs)

          setTargetCalories(String(remCal >= 200 ? remCal : goalCal))
          setTargetProtein(String(remCal >= 200 ? remProt : goalProt))
          setTargetFat(String(remCal >= 200 ? remFat : goalFat))
          setTargetCarbs(String(remCal >= 200 ? remCarbs : goalCarbs))
        }
      } catch {
        // Fallback на дневные нормы
      }
    }

    loadDayContext()
    return () => {
      active = false
    }
  }, [planDate, goalCal, goalProt, goalFat, goalCarbs])

  const handleFillRemaining = () => {
    const remCal = Math.max(200, goalCal - eatenStats.calories)
    const remProt = Math.max(10, goalProt - eatenStats.protein)
    const remFat = Math.max(10, goalFat - eatenStats.fat)
    const remCarbs = Math.max(10, goalCarbs - eatenStats.carbs)
    setTargetCalories(String(remCal))
    setTargetProtein(String(remProt))
    setTargetFat(String(remFat))
    setTargetCarbs(String(remCarbs))
    addToast('Подставлен остаток КБЖУ на выбранный день', 'info', 2000)
  }

  const handleFillFullDayGoal = () => {
    setTargetCalories(String(goalCal))
    setTargetProtein(String(goalProt))
    setTargetFat(String(goalFat))
    setTargetCarbs(String(goalCarbs))
    addToast('Подставлена полная дневная норма КБЖУ', 'info', 2000)
  }

  const handleGenerate = async (onlyUnlocked: boolean) => {
    const cal = parseFloat(targetCalories) || 0
    if (cal < 100) {
      addToast('Укажите лимит калорий не менее 100 ккал', 'warning')
      return
    }

    await generatePlan({
      planDate,
      mealsCount,
      targetCalories: cal,
      targetProtein: parseFloat(targetProtein) || 0,
      targetFat: parseFloat(targetFat) || 0,
      targetCarbs: parseFloat(targetCarbs) || 0,
      userPreferences: preferences,
      onlyUnlocked,
    })
  }

  const handleAddMealToDiary = async (item: PlannedMealItem) => {
    setAddingMealId(item.id)
    try {
      await addMeal({
        name: item.name,
        calories: Math.round(item.calories),
        protein: Math.round(item.protein * 10) / 10,
        fat: Math.round(item.fat * 10) / 10,
        carbs: Math.round(item.carbs * 10) / 10,
        weight_grams: Math.round(item.weight_grams),
        ingredients: item.ingredients || [],
        user_comment: `Из AI-плана питания (${item.meal_label})`,
        meal_date: planDate,
        meal_time: new Date().toTimeString().slice(0, 5),
        is_manually_edited: false,
      })
      await markMealAddedToDiary(planDate, item.id)
      addToast(`«${item.name}» добавлено в съеденное за ${planDate}!`, 'success', 3000)
    } catch {
      addToast('Не удалось добавить блюдо в дневник', 'error')
    } finally {
      setAddingMealId(null)
    }
  }

  const lockedCount = currentPlan?.meals.filter((m) => m.locked).length || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 my-0">
            <ChefHat className="w-5 h-5 text-emerald-400" />
            <span>Что съесть (Меню AI)</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Персональный подбор блюд и состава без превышения лимита калорий
          </p>
        </div>
      </div>

      {/* Step 1: Date & Parameters Configuration Card */}
      <Card variant="default" padding="md" className="space-y-4">
        {/* Date Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>1. На какой день спланировать питание?</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPlanDate(todayStr)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  planDate === todayStr
                    ? 'bg-emerald-500 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => setPlanDate(tomorrowStr)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  planDate === tomorrowStr
                    ? 'bg-emerald-500 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                Завтра
              </button>
            </div>
          </div>

          <input
            type="date"
            value={planDate}
            onChange={(e) => e.target.value && setPlanDate(e.target.value)}
            className="w-full bg-[#141417] border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500"
          />
        </div>

        {/* Number of Meals Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-200 block">
            2. Количество приёмов пищи (блюд):
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setMealsCount(cnt)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  mealsCount === cnt
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-[#141417] border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {cnt} {pluralizeRu(cnt, ['блюдо', 'блюда', 'блюд'])}
              </button>
            ))}
          </div>
        </div>

        {/* Target KBJU Inputs (Auto-filled from remaining, freely editable) */}
        <div className="space-y-2.5 pt-1 border-t border-neutral-800/80">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-xs font-semibold text-neutral-200">
              3. Целевые КБЖУ для этих блюд:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleFillRemaining}
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 cursor-pointer"
              >
                Остаток дня ({Math.max(0, goalCal - eatenStats.calories)} ккал)
              </button>
              <button
                type="button"
                onClick={handleFillFullDayGoal}
                className="text-[10px] font-medium text-neutral-400 hover:text-white bg-neutral-800 px-2 py-0.5 rounded-lg cursor-pointer"
              >
                Вся норма ({goalCal} ккал)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Input
              label="Макс. Калории *"
              type="number"
              min="100"
              max="15000"
              value={targetCalories}
              onChange={(e) => setTargetCalories(e.target.value)}
            />
            <Input
              label="Белки (г)"
              type="number"
              min="0"
              value={targetProtein}
              onChange={(e) => setTargetProtein(e.target.value)}
            />
            <Input
              label="Жиры (г)"
              type="number"
              min="0"
              value={targetFat}
              onChange={(e) => setTargetFat(e.target.value)}
            />
            <Input
              label="Углеводы (г)"
              type="number"
              min="0"
              value={targetCarbs}
              onChange={(e) => setTargetCarbs(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Главный приоритет AI — строго <b>не выйти за предел {targetCalories || 0} ккал</b>.
            </span>
          </div>
        </div>

        {/* Optional Preferences */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-300 block">
            Пожелания или исключения (опционально)
          </label>
          <input
            type="text"
            placeholder="Например: из простых продуктов, без рыбы, побольше белка..."
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="w-full bg-[#141417] border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Action Buttons: Generate All vs Regenerate Unlocked */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {lockedCount > 0 && currentPlan ? (
            <>
              <Button
                type="button"
                className="flex-1"
                size="md"
                isLoading={isGenerating}
                onClick={() => handleGenerate(true)}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Перегенерировать остальные (оставить {lockedCount})
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isGenerating}
                onClick={() => handleGenerate(false)}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Всё меню заново
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="w-full"
              size="lg"
              isLoading={isGenerating}
              onClick={() => handleGenerate(false)}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {currentPlan ? 'Сгенерировать меню заново' : 'Сгенерировать меню через AI'}
            </Button>
          )}
        </div>
      </Card>

      {/* Step 2: Generated Meal Plan Result */}
      {currentPlan && currentPlan.meals.length > 0 && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Totals Summary Bar */}
          <Card variant="default" padding="sm" className="bg-[#161f1c] border-emerald-500/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[11px] text-emerald-300 font-semibold block">
                  Итого по сгенерированному меню ({currentPlan.meals.length}{' '}
                  {pluralizeRu(currentPlan.meals.length, ['блюдо', 'блюда', 'блюд'])}):
                </span>
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="font-extrabold text-white text-sm">
                    {Math.round(currentPlan.total_generated_calories)} /{' '}
                    {Math.round(currentPlan.target_calories)} ккал
                  </span>
                  <span className="text-blue-300">
                    Б: {Math.round(currentPlan.total_generated_protein)}г
                  </span>
                  <span className="text-amber-300">
                    Ж: {Math.round(currentPlan.total_generated_fat)}г
                  </span>
                  <span className="text-purple-300">
                    У: {Math.round(currentPlan.total_generated_carbs)}г
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-neutral-400">
                Отметьте «Оставить», чтобы закрепить понравившиеся блюда
              </span>
            </div>
          </Card>

          {/* Planned Meal Cards */}
          {currentPlan.meals.map((meal) => (
            <Card
              key={meal.id}
              variant="default"
              padding="md"
              className={`space-y-3 transition-all ${
                meal.locked
                  ? 'border-emerald-500/50 bg-[#18221f]'
                  : 'border-neutral-800/90'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                      {meal.meal_label}
                    </span>
                    <span className="text-xs text-neutral-400 font-medium">
                      {Math.round(meal.weight_grams)} г
                    </span>
                    {meal.added_to_diary && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        В дневнике ✓
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                    {meal.name}
                  </h3>
                </div>

                {/* Lock / Keep Button */}
                <button
                  type="button"
                  onClick={() => toggleLockMeal(planDate, meal.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
                    meal.locked
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm'
                      : 'bg-[#141418] text-neutral-400 hover:text-white border-neutral-700'
                  }`}
                  title="Закрепить это блюдо при перегенерации остальных"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{meal.locked ? 'Оставлено' : 'Оставить'}</span>
                </button>
              </div>

              {/* Macros Row */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  {Math.round(meal.calories)} ккал
                </span>
                <span className="text-[11px] font-medium text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                  Б: {meal.protein}г
                </span>
                <span className="text-[11px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                  Ж: {meal.fat}г
                </span>
                <span className="text-[11px] font-medium text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                  У: {meal.carbs}г
                </span>
              </div>

              {/* Recipe = Simple Ingredients Composition */}
              {meal.ingredients && meal.ingredients.length > 0 && (
                <div className="bg-[#141417] border border-neutral-800/80 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Состав блюда (ингредиенты):</span>
                  </div>
                  <div className="divide-y divide-neutral-800/60">
                    {meal.ingredients.map((ing, i) => (
                      <div
                        key={i}
                        className="py-1 flex items-center justify-between text-xs gap-2"
                      >
                        <span className="text-neutral-200 truncate">{ing.name}</span>
                        <span className="text-neutral-400 font-mono text-[11px] shrink-0">
                          {Math.round(ing.weight_grams)}г • {Math.round(ing.calories)} ккал
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* One-Click Add to Eaten Diary */}
              <div className="pt-1 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant={meal.added_to_diary ? 'secondary' : 'primary'}
                  isLoading={addingMealId === meal.id}
                  onClick={() => handleAddMealToDiary(meal)}
                  leftIcon={
                    meal.added_to_diary ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {meal.added_to_diary
                    ? 'Добавить в съеденное ещё раз'
                    : 'Добавить в съеденное'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### Шаг 14. Добавление вкладки «Что съесть» в `BottomNav.tsx` и маршрута в `App.tsx`

1. В `frontend/src/App.tsx` импортируй `MealPlanPage` и добавь маршрут внутри `<Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>`:
   ```tsx
   import { MealPlanPage } from './pages/MealPlanPage'
   ...
   <Route index element={<TodayPage />} />
   <Route path="meal-plan" element={<MealPlanPage />} />
   <Route path="stats" element={<StatsPage />} />
   <Route path="profile" element={<ProfilePage />} />
   ```

2. В `frontend/src/components/layout/BottomNav.tsx` импортируй иконку `ChefHat` из `'lucide-react'` и добавь вкладку **«Что съесть»** (`/meal-plan`) между вкладкой «Сегодня» и центральной кнопкой «Добавить» (или после неё):

```tsx
        {/* Tab 2: Что съесть (AI Меню) */}
        <NavLink
          to="/meal-plan"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
              isActive
                ? 'text-emerald-400 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`relative p-1 rounded-xl transition-all ${
                  isActive ? 'bg-emerald-500/10' : ''
                }`}
              >
                <ChefHat
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.3]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Что съесть</span>
            </>
          )}
        </NavLink>
```

---

### Шаг 15. Голосовой ввод (Voice-to-Log) в `frontend/src/components/meals/AddMealModal.tsx` и карточка привязки Telegram-бота в `ProfilePage.tsx` (ФИЧА 2)

#### 15.1. Добавление голосового режима в `AddMealModal.tsx`

В `frontend/src/components/meals/AddMealModal.tsx`:
1. Импортируй иконки `Mic, Square` из `'lucide-react'`.
2. Расширь тип `ModalMode`:
   `type ModalMode = 'hub' | 'barcode' | 'ai_photo' | 'text_ai' | 'voice_ai' | 'search' | 'recipes' | 'manual'`
3. Достань `startVoiceAIAnalysis` из `useMealsStore()`.
4. Добавь состояния диктофона:
   ```tsx
   const [isRecording, setIsRecording] = useState(false)
   const [recordingSeconds, setRecordingSeconds] = useState(0)
   const mediaRecorderRef = useRef<MediaRecorder | null>(null)
   const audioChunksRef = useRef<Blob[]>([])
   ```
5. Добавь функции старта и остановки записи голоса:
   ```tsx
   const startVoiceRecording = async () => {
     try {
       const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
       const recorder = new MediaRecorder(stream)
       audioChunksRef.current = []

       recorder.ondataavailable = (e) => {
         if (e.data.size > 0) audioChunksRef.current.push(e.data)
       }

       recorder.onstop = () => {
         stream.getTracks().forEach((t) => t.stop())
         const audioBlob = new Blob(audioChunksRef.current, {
           type: recorder.mimeType || 'audio/webm',
         })
         if (audioBlob.size > 0) {
           startVoiceAIAnalysis(audioBlob, selectedDate)
           closeAddMeal()
           addToast(
             'Голосовое сообщение отправлено в AI! Расшифровка сохранится в описание блюда.',
             'info',
             4000
           )
         }
       }

       mediaRecorderRef.current = recorder
       recorder.start()
       setIsRecording(true)
       setRecordingSeconds(0)
     } catch {
       addToast('Не удалось получить доступ к микрофону в браузере', 'error')
     }
   }

   const stopVoiceRecording = () => {
     if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
       mediaRecorderRef.current.stop()
     }
     setIsRecording(false)
   }
   ```
6. На главном экране `mode === 'hub'` (или внутри вкладки `Текст AI`) добавь кнопку **«🎤 Голос AI»** (`setMode('voice_ai')`), а для `mode === 'voice_ai'` выведи крупную кнопку записи голоса с подсказкой: *«Скажите, что вы съели (например: "Тарелка борща 350г со сметаной и два куска хлеба"). Нейросеть расшифрует вашу речь, поместит расшифровку в описание продукта для удобного редактирования и посчитает КБЖУ»*.

#### 15.2. Создай компонент `frontend/src/components/settings/TelegramBotCard.tsx`

```tsx
import React, { useEffect, useState } from 'react'
import { Send, CheckCircle2, Copy, RefreshCw, Unlink, ExternalLink } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { telegramApi } from '../../api/telegram'
import { TelegramStatusResponse } from '../../types'
import { useUIStore } from '../../store/uiStore'

export const TelegramBotCard: React.FC = () => {
  const { addToast } = useUIStore()
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const loadStatus = async () => {
    try {
      const data = await telegramApi.getStatus()
      setStatus(data)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleGenerateCode = async () => {
    setIsGenerating(true)
    try {
      const data = await telegramApi.generateLinkCode()
      setStatus(data)
      addToast('Код привязки Telegram сгенерирован!', 'success')
    } catch {
      addToast('Не удалось создать код привязки', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUnlink = async () => {
    if (!window.confirm('Отвязать Telegram-аккаунт от KaloriiAI?')) return
    try {
      const data = await telegramApi.unlink()
      setStatus(data)
      addToast('Telegram-аккаунт отвязан', 'info')
    } catch {
      addToast('Ошибка при отвязке Telegram', 'error')
    }
  }

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast('Код скопирован в буфер обмена', 'info', 2000)
  }

  return (
    <Card variant="default" padding="md" className="space-y-3.5">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white my-0">
            Telegram-бот KaloriiAI
          </h3>
        </div>
        {status?.is_linked && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Привязан
          </span>
        )}
      </div>

      <p className="text-xs text-neutral-400 leading-relaxed">
        Отправляйте боту <b>фото еды с подписью</b>, <b>текстовые сообщения</b> или{' '}
        <b>голосовые сообщения</b> — бот автоматически распознает блюдо через AI и
        добавит его в ваш дневник (с сохранением расшифровки голоса в описание блюда на сайте).
      </p>

      {isLoading ? (
        <div className="h-12 rounded-xl bg-neutral-800/50 animate-pulse" />
      ) : status?.is_linked ? (
        <div className="flex items-center justify-between bg-[#141418] border border-neutral-800 p-3 rounded-xl">
          <div className="text-xs">
            <span className="text-neutral-400 block">Подключённый аккаунт:</span>
            <span className="font-bold text-white">
              {status.telegram_username ? `@${status.telegram_username}` : `Chat ID: ${status.telegram_chat_id}`}
            </span>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleUnlink}
            leftIcon={<Unlink className="w-3.5 h-3.5" />}
          >
            Отвязать
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {status?.link_code ? (
            <div className="bg-[#141418] border border-sky-500/30 p-3 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-300">
                  Отправьте этот код боту в Telegram:
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(status.link_code!)}
                  className="inline-flex items-center gap-1 text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 cursor-pointer"
                >
                  <span>{status.link_code}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>

              {status.deep_link_url && (
                <a
                  href={status.deep_link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Открыть бота в Telegram и привязать в 1 клик</span>
                </a>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              isLoading={isGenerating}
              onClick={handleGenerateCode}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              {status?.link_code ? 'Обновить код' : 'Получить код привязки Telegram'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadStatus}
            >
              Проверить статус
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
```

#### 15.3. Подключи `TelegramBotCard` в `frontend/src/pages/ProfilePage.tsx`

В `frontend/src/pages/ProfilePage.tsx` импортируй `TelegramBotCard`:
```tsx
import { TelegramBotCard } from '../components/settings/TelegramBotCard'
```
И отрендери `<TelegramBotCard />` прямо перед `<AISettingsCard />` внизу страницы профиля.

---

## Чек-лист проверки после выполнения Части 2

1. Примени миграции базы данных:
   ```bash
   cd backend && python -m alembic upgrade head
   ```
2. Запусти pytest и убедись, что эндпоинты `/api/meal-plan/generate`, `/api/meal-plan`, `/api/ai/recognize-voice` и `/api/telegram/link-code` работают корректно.
3. Собери фронтенд и обнови статический бандл бэкенда:
   ```bash
   cd frontend && npm run build
   rm -rf ../backend/static/assets
   cp -r dist/* ../backend/static/
   ```
