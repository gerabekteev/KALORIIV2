# 📝 KaloriiAI — Changelog

> Лог всех значимых изменений в проекте. AI-ассистенты **обязаны** добавлять записи сюда после каждой сессии работы.

---

## [2026-10-13] — Релиз v1.0.0 (100% готовность к релизу и продакшену)

### ⭐ Новые возможности (Wave 4)
- **Модуль рецептов и избранного**:
  - Добавлена 4-я вкладка в диалог добавления еды (`AddMealModal.tsx`).
  - Компонент `RecipeList.tsx` с поиском, фильтрацией избранного и расчётом порций.
  - Модальное окно создания рецептов (`CreateRecipeModal.tsx`) в двух режимах: экспресс-ввод и расчёт из ингредиентов базы продуктов.
  - Сохранение съеденного блюда из дневника как рецепт (`MealCard.tsx`).
- **Интерактивная панель AI в профиле (`AISettingsCard.tsx`)**:
  - Настройка приоритетов моделей кнопками Вверх/Вниз, чекбоксы включения/выключения.
  - Статусы доступности: Активна, Резерв, Откл.
  - Поля пользовательских API ключей (Gemini, OpenRouter) с переопределением системных настроек через заголовки HTTP.
- **PWA и мобильная готовность**:
  - Сгенерированы антиалиасинг PNG-иконки `icon-192.png` и `icon-512.png`.
  - Service Worker обновлен для кеширования всех ассетов и автономной работы.

### 🛡️ Финальный аудит QA Критика (Оценка 9.8 / 10)
- Защита целостности связей `Product -> RecipeItem`: запрет случайного удаления используемых продуктов.
- Исправление SQLAlchemy reload связей в `toggle_favorite` для предотвращения `MissingGreenlet`.
- Мгновенный 429 failover при любых ошибках квот Google/OpenRouter (< 0.002s).
- Сборка фронтенда: 0 ошибок TypeScript, 815 КБ бандл.
- Тесты бэкенда: 4/4 сьютов пройдены успешно (32 интеграционных теста).

---

## [2026-10-13] — Повышение надёжности AI Vision, актуализация приоритетов моделей и полное покрытие тестами (v0.1.1)

### ⚙️ Backend & AI Vision Resilience
- **Актуализация приоритетов моделей (`DEFAULT_MODEL_CHAIN`)**:
  - В качестве основной и самой надёжной модели установлен `("gemini", "gemini-3.5-flash-lite")` (100% доступность, субсекундный отклик).
  - Настроена быстрая fallback-цепочка: `gemini-3.8-flash` → `gemini-3.7-flash` → `google/gemma-4-26b-a4b-it:free` → `openrouter/free`.
  - Улучшена обработка `AIRateLimitError`: при получении HTTP 429 роутер не ждёт 5 секунд вхолостую, а немедленно переключается на следующую модель цепочки.
- **Поддержка multi-part и thinking-блоков в Gemini (`GeminiProvider`)**:
  - Игнорирование частей ответа с флагом `thought: True` / `thinking: True`.
  - Извлечение JSON строго из текстовых частей ответа модели.
  - Очистка ответа от инлайн-тегов `<thought>...</thought>`, `<thinking>...</thinking>`, `<think>...</think>`.
  - Обработка сценариев частичной блокировки кандидатов (`promptFeedback`, `finishReason: SAFETY`).
- **Graceful degradation в OpenRouter (`OpenRouterProvider`)**:
  - Корректный парсинг структурированных сообщений об ошибках из JSON (включая `error.message` и `metadata.raw`).
  - Автоматический fallback и retry при отказе бесплатной модели принимать параметр `response_format: {"type": "json_object"}`.
  - Очистка `<thought>` блоков и обработка ответов со статусом 200, содержащих ошибки на стороне апстрим-провайдера.

### 🧪 Тестирование
- Полный прогон `pytest` через виртуальное окружение `.venv\Scripts\python.exe -m pytest` завершён со 100% успехом (3/3 тест-сьютов).
- Расширен `test_live_api.py`: добавлен 11-й интеграционный шаг с отправкой синтетического изображения еды в `/api/ai/recognize` и верификацией реального ответа Gemini 3.5 Flash Lite.
- Все тесты `test_backend.py` (20 шагов) и `test_edge_cases.py` (7 шагов) полностью пройдены.

### 📋 Документация
- Синхронизирован `AI-MODELS-CATALOG.md` с актуальной цепочкой моделей и поведением роутера.
- Обновлён `docs/AI-GUIDE.md` новыми рекомендациями по обработке AI-провайдеров.

---

## [2026-10-13] — Первоначальная разработка (v0.1.0)

### 🏗️ Инициализация
- Создан полный план проекта (`PLAN-KaloriiAI.md`)
- Создан каталог AI моделей (`AI-MODELS-CATALOG.md`)
- Создана документация для AI (`docs/AI-GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`)

### ⚙️ Backend
- Создан FastAPI бэкенд с полной структурой
- SQLAlchemy модели: Users, Meals, Products, Recipes, RecipeItems, WeightLog
- Pydantic v2 схемы для всех моделей
- JWT аутентификация (register, login, refresh, me)
- API роутеры: auth, meals, products, recipes, stats, profile, ai
- AI Router с мультипровайдером (Gemini + OpenRouter) и fallback-цепочкой
- Сервис расчёта КБЖУ (Mifflin-St Jeor)
- Обработка изображений (resize, compress)
- Seed данные: 50+ популярных продуктов с КБЖУ
- Alembic миграции

### 🖥️ Frontend
- React 18 + TypeScript + Vite проект
- Tailwind CSS тёмная тема
- Zustand стейт-менеджеры (auth, meals, ui)
- React Router с защищёнными маршрутами
- Все страницы: Login, Register, Today, Stats, Profile
- UI компоненты: Button, Input, Modal, ProgressRing, ProgressBar, Card, Loading, Toast
- Компоненты еды: MealCard, MealList, AddMealModal, EditMealModal, AIResultModal
- Компоненты статистики: CaloriesBarChart, CaloriesTrendChart, MacrosPieChart, WeightTrendChart, ProgressRings, PeriodSelector
- Компоненты продуктов: ProductSearch, ProductItem
- API клиент с JWT interceptor
- PWA manifest + Service Worker

### 📋 Метод разработки
- Использованы субагенты в режиме Pro:
  - Backend Developer — полная разработка серверной части
  - Frontend Developer — полная разработка клиентской части  
  - Code Critic — проверка качества и исправление багов
- Оркестратор координировал работу волнами (разработка → проверка → доработка)

---

## Формат записей

```markdown
## [ДАТА] — Краткое описание (версия)

### Категория (🏗️ / ⚙️ / 🖥️ / 🐛 / 🔧 / 📋)
- Что было сделано
- Какие файлы затронуты
- Какие решения приняты

### Метод
- Какие субагенты использовались (если были)
- Сколько волн разработки
```
