# Техническое задание и аудит для ИИ-агента: Исправление всех ошибок и реализация новых функций в KaloriiAI (kaloriiv2)

Данный документ предназначен для ИИ-агента, имеющего доступ к редактированию Git-репозитория проекта **KaloriiAI**. Документ состоит из двух частей:
1. **Часть 1. Исправление всех 27 найденных багов и неточностей** (бэкенд, безопасность, база данных, фронтенд, вёрстка и дизайн) с указанием точных файлов, номеров строк, причины возникновения и готового кода исправления.
2. **Часть 2. Детальная спецификация реализации 4 новых функциональных и UX-улучшений** с полным описанием изменений в БД, схемах Pydantic, роутерах FastAPI, типах TypeScript, сторах Zustand и React-компонентах.

## Архитектурный контекст и правила работы с репозиторием

* **Стек бэкенда**: Python 3.12, FastAPI, SQLAlchemy 2.0 (AsyncSession + `aiosqlite`), Alembic, Pydantic v2, `httpx`, `Pillow`. Код расположен в `backend/app/`.
* **Стек фронтенда**: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand, Recharts, Lucide Icons. Код расположен в `frontend/src/`.
* **Синхронизация схемы БД**: проект использует как миграции Alembic (`backend/alembic/versions/`), так и автоматическое применение `ALTER TABLE` внутри `lifespan` в `backend/app/main.py`. При добавлении новых колонок в модели SQLAlchemy обязательно добавляй `ALTER TABLE` в `lifespan` (`backend/app/main.py`) и создавай новую ревизию в `backend/alembic/versions/`.
* **Сборка фронтенда**: бэкенд раздаёт собранную статику из `backend/static/` или `frontend/dist/`. После внесения всех изменений во фронтенд выполни проверку типов и сборку (`cd frontend && npm run build`) и при необходимости обнови `backend/static/`.

## Сводная таблица задач для ИИ-агента

| Код задачи | Категория | Файлы | Краткое описание |
| :--- | :--- | :--- | :--- |
| **BUG-B01** | Бэкенд / Crash | `backend/app/routers/barcode.py`, `schemas/ai.py` | Падение `POST /api/barcode/scan-image` с `AttributeError` из-за отсутствия `raw_response` в `FoodAnalysisResult` |
| **BUG-B02** | Бэкенд / Логика | `backend/app/routers/barcode.py` | Запись КБЖУ всей пачки в поля `*_per_100g` и создание дубликатов `Product` с одинаковым штрихкодом |
| **BUG-B03** | Безопасность | `backend/app/routers/meals.py` | Path Traversal в `delete_meal`: возможность удалить `db.sqlite3` через `photo_path` |
| **BUG-B04** | Бэкенд / Файлы | `backend/app/routers/meals.py`, `BarcodePortionModal.tsx` | Удаление общего фото продукта (`Product.image_url`) с диска при удалении приёма пищи |
| **BUG-B05** | Бэкенд / Файлы | `backend/app/routers/ai.py`, `utils/image.py` | Накопление «сиротских» файлов в `/uploads/` при отмене сохранения распознанного блюда |
| **BUG-B06** | Безопасность | `backend/app/routers/auth.py` | Приём просроченных `access_token` вместо `refresh_token` в `/api/auth/refresh` и срок жизни 60 дней |
| **BUG-B07** | Безопасность | `backend/app/services/barcode_service.py` | IDOR в `PUT /api/barcode/product/{id}`: перезапись чужих кастомных и системных seed-продуктов |
| **BUG-B08** | Бэкенд / Доступ | `backend/app/routers/recipes.py`, `products.py` | Привязка чужих приватных продуктов к рецептам и блокировка их удаления владельцем |
| **BUG-B09** | Бэкенд / API | `backend/app/routers/products.py` | Потеря полей `barcode`, `brand`, `image_url`, `package_weight_grams` в `POST /api/products` |
| **BUG-B10** | Бэкенд + Фронт | `backend/app/routers/meals.py`, `EditMealModal.tsx` | Невозможность очистить (удалить) комментарий `user_comment` у приёма пищи |
| **BUG-B11** | Бэкенд / Логика | `backend/app/routers/meals.py` | Сброс бейджа AI (`is_manually_edited = True`) после пересчёта блюда нейросетью в `/recalculate` |
| **BUG-B12** | Бэкенд / Время | `backend/app/routers/profile.py`, `meals.py`, `stats.py` | Необновление `current_weight_kg` при разнице часовых поясов (`date.today()`) и отсутствие округления веса |
| **BUG-B13** | БД / DevOps | `backend/app/database.py`, `deploy/kalorii.service` | Отсутствие `PRAGMA journal_mode=WAL` и `busy_timeout` в SQLite при конкурентных запросах |
| **BUG-B14** | Архитектура | `frontend/src/api/recipes.ts`, `routers/recipes.py` | Засорение поиска продуктов фейковыми записями с категорией `'Рецепты'` при создании быстрых рецептов |
| **BUG-F01** | Дизайн / CSS | `frontend/src/index.css` | Подключённый шрифт `Inter` перекрывается системным шрифтом в `html, body` |
| **BUG-F02** | Вёрстка / CSS | `frontend/src/index.css`, `BottomNav.tsx`, `AISettingsCard.tsx` | Отсутствие `@config` для Tailwind v4 и несуществующие классы `safe-bottom` и `py-0.2` |
| **BUG-F03** | Мобильный UI | `frontend/src/components/layout/Header.tsx`, `index.html` | Наложение шапки на Dynamic Island в iOS PWA и блокировка зума `user-scalable=no` |
| **BUG-F04** | Вёрстка / Сетка | `Header.tsx`, `BottomNav.tsx`, `Layout.tsx` | Разная ширина шапки/навигации (`max-w-md` = 448px) и контента (`max-w-lg` = 512px) |
| **BUG-F05** | UI / Модалки | `CreateRecipeModal.tsx` | Обрезание выпадающего списка ингредиентов нижней границей модального окна |
| **BUG-F06** | Статистика / UI | `frontend/src/pages/StatsPage.tsx` | Вывод `0k ккал` в карточке «Всего» при сумме менее 500 ккал и грубое округление до тысяч |
| **BUG-F07** | Графики / Логика | `CaloriesBarChart.tsx`, `routers/stats.py` | Расхождение порогов выполнения нормы между графиком (`90–110%`) и бэкендом (`85–115%`) |
| **BUG-F08** | Расчёты КБЖУ | `ProfilePage.tsx`, `TodayPage.tsx`, `StatsPage.tsx` | Разные дефолтные цели (`2200` vs `2000`) и разные формулы расчёта Mifflin-St Jeor на фронте и бэке |
| **BUG-F09** | Локализация | `TodayPage.tsx`, `StatsPage.tsx`, `RecentScannedShelf.tsx` | Ошибки склонения русских числительных («2 дней», «5 записи», «2 продуктов», «5 блюда») |
| **BUG-F10** | Стейт / Сортировка | `frontend/src/store/mealsStore.ts` | Нарушение хронологической сортировки блюд по `meal_time` при добавлении и редактировании |
| **BUG-F11** | Настройки AI | `AISettingsCard.tsx`, `services/ai_router.py` | Разный порядок приоритета AI-моделей по умолчанию на фронтенде и бэкенде |
| **BUG-F12** | Сканер / AI | `BarcodeScannerView.tsx`, `api/barcode.ts` | Неиспользуемый метод `barcodeApi.scanImage` при загрузке фото упаковки без читаемого 1D-штрихкода |
| **BUG-F13** | PWA / Кэш | `frontend/public/sw.js` | Ошибки `cache.put` на `non-GET` запросах и бесконечное кэширование фотографий из `/uploads/` |
| **FEAT-01** | Новая функция | Бэкенд + Фронтенд | Мультикомпонентное AI-распознавание (разбивка сложного блюда на ингредиенты с редактированием веса) |
| **FEAT-02** | Новая функция | Бэкенд + Фронтенд | Копирование приёмов пищи со вчерашнего дня и быстрый повтор («Повторить вчерашний завтрак») |
| **FEAT-03** | Новая функция | Фронтенд (UX) | Жесты свайпа (Swipe Actions) по карточке блюда и отмена удаления («Undo» в тосте) |
| **FEAT-04** | Новая функция | Фронтенд (UI) | Интерактивная полоса недели (Week Strip Calendar) с индикаторами прогресса в шапке дневника |

## Часть 1. Полный реестр ошибок и инструкции по их исправлению

### Раздел 1.1. Ошибки бэкенда, безопасности и базы данных

#### BUG-B01. Гарантированное падение `POST /api/barcode/scan-image` с `AttributeError`
* **Файл**: `backend/app/routers/barcode.py` (строки 145–148) и `backend/app/schemas/ai.py` (строки 5–14).
* **В чём ошибка и почему возникает**:
  В функции `scan_barcode_image_endpoint` после успешного вызова `analysis_result, provider_name, model_name = await ai_router.recognize_food(...)` выполняется поиск штрихкода регулярным выражением:
  ```python
  candidates = re.findall(
      r"\b\d{8,14}\b",
      f"{analysis_result.name or ''} {analysis_result.raw_response or ''}"
  )
  ```
  Метод `ai_router.recognize_food` возвращает кортеж `(FoodAnalysisResult, str, str)`. В схеме `FoodAnalysisResult` (`backend/app/schemas/ai.py`) определены только поля `name`, `weight_grams`, `calories`, `protein`, `fat`, `carbs`, `confidence` — поля `raw_response` у неё **нет** (оно есть только в `FoodRecognitionResponse`). Обращение к `analysis_result.raw_response` всегда выбрасывает `AttributeError: 'FoodAnalysisResult' object has no attribute 'raw_response'`, который перехватывается блоком `except Exception` (строка 198), удаляет загруженное фото, откатывает транзакцию БД и возвращает клиенту `422 Unprocessable Entity`.
* **Как исправить**:
  1. Добавить опциональное поле `raw_response: Optional[str] = None` в схему `FoodAnalysisResult` (`backend/app/schemas/ai.py`) и заполнять его в `parse_food_result` (`backend/app/utils/ai_providers/base.py`) как `json.dumps(raw_json, ensure_ascii=False)`.
  2. В `backend/app/routers/barcode.py` (строка 147) использовать `getattr(analysis_result, "raw_response", "") or ""`.

#### BUG-B02. Некорректная запись КБЖУ и дублирование товаров в `POST /api/barcode/scan-image`
* **Файл**: `backend/app/routers/barcode.py` (строки 130–175).
* **В чём ошибка и почему возникает**:
  1. Промпт `build_system_prompt` в `base.py` просит AI вернуть КБЖУ для всего блюда/упаковки целиком, однако в `scan_barcode_image_endpoint` полученные значения `analysis_result.calories`, `protein`, `fat`, `carbs` записываются напрямую в поля `calories_per_100g`, `protein_per_100g`, `fat_per_100g`, `carbs_per_100g` без учёта веса упаковки, если AI вернул КБЖУ на всю пачку, либо наоборот.
  2. Даже если штрихкод `detected_code` уже существует в таблице `products`, эндпоинт безусловно создаёт дубликат `Product(name=name, barcode=detected_code, ...)`, нарушая однозначность поиска по штрихкоду.
* **Как исправить**:
  В `scan_barcode_image_endpoint` (`backend/app/routers/barcode.py`):
  1. Уточнить в `ocr_comment`, чтобы нейросеть вернула в полях `calories`, `protein`, `fat`, `carbs` значения **строго в расчёте на 100 грамм продукта**, а в поле `weight_grams` — массу нетто упаковки в граммах (по умолчанию `100`).
  2. Если `detected_code` найден, сначала проверять наличие продукта в БД (`select(Product).where(Product.barcode == detected_code).limit(1)`). Если продукт уже есть — обновлять или возвращать существующую запись вместо создания дубликата.

#### BUG-B03. Критическая уязвимость Path Traversal (произвольное удаление файлов) при удалении приёма пищи
* **Файл**: `backend/app/routers/meals.py` (строки 173–180).
* **В чём ошибка и почему возникает**:
  В `delete_meal` удаление файла фотографии реализовано так:
  ```python
  if meal.photo_path and meal.photo_path.startswith("/uploads/"):
      filename = meal.photo_path.replace("/uploads/", "")
      photo_file = settings.UPLOAD_DIR / filename
      if photo_file.exists():
          photo_file.unlink()
  ```
  Поскольку `POST /api/meals` принимает любую строку в `photo_path` из тела запроса, злоумышленник может создать приём пищи с `photo_path: "/uploads/../data/db.sqlite3"` и вызвать `DELETE /api/meals/{id}`. Конструкция `settings.UPLOAD_DIR / "../data/db.sqlite3"` выйдет за пределы папки `uploads` и удалит рабочую базу данных SQLite.
* **Как исправить**:
  Извлекать только базовое имя файла через `Path(meal.photo_path).name` и проверять через `.resolve()`, что итоговый путь находится строго внутри `settings.UPLOAD_DIR.resolve()`:
  ```python
  if meal.photo_path and meal.photo_path.startswith("/uploads/"):
      safe_name = Path(meal.photo_path).name
      upload_root = settings.UPLOAD_DIR.resolve()
      photo_file = (upload_root / safe_name).resolve()
      if photo_file.parent == upload_root and photo_file.is_file():
          # Также см. BUG-B04: проверить, не используется ли этот файл другими записями!
  ```

#### BUG-B04. Удаление общего фото товара из базы при удалении приёма пищи
* **Файл**: `backend/app/routers/meals.py` (строки 173–180) и `frontend/src/components/barcode/BarcodePortionModal.tsx` (строка 235).
* **В чём ошибка и почему возникает**:
  Когда пользователь добавляет в дневник продукт, отсканированный через `/api/barcode/scan-image`, `BarcodePortionModal.tsx` передаёт `photo_path: product.image_url` (который указывает на `/uploads/{uuid}.jpg`). Также при копировании приёма пищи несколько записей `Meal` могут ссылаться на один и тот же `photo_path`. Когда пользователь удаляет один такой приём пищи, `delete_meal` удаляет файл `/uploads/{uuid}.jpg` с диска, в результате чего `Product.image_url` и остальные приёмы пищи получают битую ссылку (404).
* **Как исправить**:
  Перед вызовом `photo_file.unlink()` в `delete_meal` (`backend/app/routers/meals.py`) проверять в БД, не ссылаются ли на этот `meal.photo_path` другие записи в таблицах `Meal` (`Meal.id != meal.id, Meal.photo_path == meal.photo_path`) или `Product` (`Product.image_url == meal.photo_path`). Удалять файл с диска только если ссылок больше нет:
  ```python
  other_meals = await db.execute(
      select(Meal.id).where(and_(Meal.id != meal.id, Meal.photo_path == meal.photo_path)).limit(1)
  )
  linked_products = await db.execute(
      select(Product.id).where(Product.image_url == meal.photo_path).limit(1)
  )
  if not other_meals.scalar_one_or_none() and not linked_products.scalar_one_or_none():
      try:
          photo_file.unlink()
      except Exception:
          pass
  ```

#### BUG-B05. Утечка «сиротских» файлов в `/uploads/`
* **Файл**: `backend/app/routers/ai.py` (строка 179) и `backend/app/utils/image.py`.
* **В чём ошибка и почему возникает**:
  `POST /api/ai/recognize` сохраняет фото в `/uploads/{uuid}.jpg` до того, как запись `Meal` будет создана в базе. Если создание `Meal` на клиенте не завершилось (пользователь закрыл вкладку, пропал интернет или отменил ввод), файл остаётся в `/uploads/` навсегда.
* **Как исправить**:
  Добавить в `backend/app/utils/image.py` функцию фоновой очистки `cleanup_orphan_uploads(db: AsyncSession, max_age_hours: int = 24)`, которая удаляет файлы в `settings.UPLOAD_DIR` старше 24 часов, не привязанные ни к одному `Meal.photo_path` и `Product.image_url`, и вызывать её при старте приложения в `lifespan` (`backend/app/main.py`).

#### BUG-B06. Критическая уязвимость авторизации в `POST /api/auth/refresh`
* **Файл**: `backend/app/routers/auth.py` (строки 109–125).
* **В чём ошибка и почему возникает**:
  В `refresh_token`:
  ```python
  try:
      payload = decode_token(token_str, expected_type="refresh")
  except HTTPException:
      # Fallback: check if valid authorization token was provided in header
      try:
          payload = jwt.decode(
              token_str,
              settings.JWT_SECRET,
              algorithms=[settings.JWT_ALGORITHM],
              options={"verify_exp": False},
          )
          exp = payload.get("exp", 0)
          max_age = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds()
          if datetime.now(timezone.utc).timestamp() - exp > max_age:
              raise HTTPException(...)
  ```
  Этот fallback содержит сразу две критические ошибки:
  1. Он полностью пропускает проверку `payload.get("type") == "refresh"`, позволяя использовать любой (даже давно истёкший) `access_token` для выпуска новой пары `access_token` + `refresh_token`.
  2. Условие `now - exp > max_age` отсчитывает 30 дней **после даты истечения `exp`**, хотя `exp` у refresh-токена уже равен `iat + 30 дней`. Таким образом, истёкший токен продолжает приниматься ещё 30 дней после истечения (суммарно 60 дней).
* **Как исправить**:
  Удалить небезопасный блок `except HTTPException:` с `verify_exp: False`. Функция `refresh_token` должна принимать исключительно валидный, неистёкший токен с `expected_type="refresh"` через `payload = decode_token(token_str, expected_type="refresh")`.

#### BUG-B07. Отсутствие проверки прав доступа (IDOR) в `PUT /api/barcode/product/{product_id}`
* **Файл**: `backend/app/services/barcode_service.py` (строки 318–355) и `backend/app/routers/barcode.py` (строки 60–97).
* **В чём ошибка и почему возникает**:
  Функция `update_barcode_product` выполняет `stmt = select(Product).where(Product.id == product_id)` без проверки владельца. В результате любой пользователь может изменить название и КБЖУ глобального системного продукта (из `products_seed.json`) или чужого кастомного продукта.
* **Как исправить**:
  В `update_barcode_product` (`backend/app/services/barcode_service.py`):
  - Разрешать редактирование глобального кэшированного продукта (`product.is_custom == False`), только если у него заполнен `barcode` (то есть это продукт из OpenFoodFacts / сканера штрихкодов, а не базовый продукт из `products_seed.json`, у которого `barcode is None`).
  - Если `product.is_custom == True`, проверять `product.created_by_user_id == user_id`. Если пользователь пытается отредактировать чужой кастомный продукт или системный seed-продукт без штрихкода, возвращать `403 Forbidden`.

#### BUG-B08. Привязка чужих кастомных продуктов к рецептам и блокировка их удаления
* **Файл**: `backend/app/routers/recipes.py` (строки 28–34) и `backend/app/routers/products.py` (строки 149–156).
* **В чём ошибка и почему возникает**:
  В `calculate_recipe_totals` (`recipes.py`) запрос `select(Product).where(Product.id == item.product_id)` не проверяет, доступен ли продукт текущему пользователю (`Product.is_custom.is_(False) | (Product.created_by_user_id == current_user.id)`). Пользователь Б может включить приватный продукт пользователя А в свой рецепт, после чего пользователь А никогда не сможет удалить свой продукт из-за проверки `select(RecipeItem).where(RecipeItem.product_id == product_id)` в `delete_custom_product`.
* **Как исправить**:
  Передавать `user_id: int` в `calculate_recipe_totals(items_data, db, current_user.id)` и фильтровать продукты условием:
  ```python
  prod_result = await db.execute(
      select(Product).where(
          and_(
              Product.id == item.product_id,
              or_(Product.is_custom.is_(False), Product.created_by_user_id == user_id),
          )
      )
  )
  ```

#### BUG-B09. Потеря полей `barcode`, `brand`, `image_url`, `package_weight_grams` при создании кастомного продукта
* **Файл**: `backend/app/routers/products.py` (строки 57–75).
* **В чём ошибка и почему возникает**:
  В `create_custom_product` (`POST /api/products`) входная схема `ProductCreate` содержит поля `barcode`, `brand`, `image_url`, `package_weight_grams`, но при создании объекта `Product(...)` они не передаются в конструктор модели.
* **Как исправить**:
  Передать все поля из `product_in` в конструктор `Product` в `backend/app/routers/products.py`:
  ```python
  product = Product(
      name=product_in.name.strip(),
      calories_per_100g=round(product_in.calories_per_100g, 1),
      protein_per_100g=round(product_in.protein_per_100g, 1),
      fat_per_100g=round(product_in.fat_per_100g, 1),
      carbs_per_100g=round(product_in.carbs_per_100g, 1),
      category=product_in.category,
      barcode=product_in.barcode.strip() if product_in.barcode else None,
      brand=product_in.brand.strip() if product_in.brand else None,
      image_url=product_in.image_url.strip() if product_in.image_url else None,
      package_weight_grams=round(product_in.package_weight_grams or 100.0, 1),
      is_custom=True,
      created_by_user_id=current_user.id,
  )
  ```

#### BUG-B10. Невозможность очистить `user_comment` при редактировании блюда
* **Файл**: `backend/app/routers/meals.py` (строки 139–144) и `frontend/src/components/meals/EditMealModal.tsx` (строка 55).
* **В чём ошибка и почему возникает**:
  В `EditMealModal.tsx` при отправке формы передаётся `user_comment: form.user_comment || undefined`. Если пользователь стёр текст комментария, на сервер уходит `undefined` (ключ опускается в JSON). А на бэкенде в `update_meal` стоит проверка `if value is not None: setattr(meal, field, value)`, которая игнорирует `null`. В итоге удалить существующий комментарий невозможно.
* **Как исправить**:
  1. В `EditMealModal.tsx` (строка 55) передавать `user_comment: form.user_comment.trim() || null`.
  2. В `backend/app/routers/meals.py` (`update_meal`, строки 139–144) разрешить установку `None` для nullable-полей (`user_comment`, `photo_path`):
  ```python
  update_data = meal_in.model_dump(exclude_unset=True)
  nullable_fields = {"user_comment", "photo_path"}
  for field, value in update_data.items():
      if value is not None:
          if isinstance(value, float):
              value = round(value, 1)
          setattr(meal, field, value)
      elif field in nullable_fields:
          setattr(meal, field, None)
  ```

#### BUG-B11. Пропажа AI-бейджа после AI-пересчёта блюда
* **Файл**: `backend/app/routers/meals.py` (строка 277).
* **В чём ошибка и почему возникает**:
  В конце `recalculate_meal` (`POST /api/meals/{meal_id}/recalculate`) стоит строка `meal.is_manually_edited = True`. Из-за этого на фронтенде (`MealCard.tsx`, строка 161: `{!meal.is_manually_edited && meal.ai_raw_response && ...}`) пропадает иконка `Sparkles`, хотя блюдо было пересчитано именно искусственным интеллектом, а не вручную.
* **Как исправить**:
  В `backend/app/routers/meals.py` (строка 277) заменить `meal.is_manually_edited = True` на `meal.is_manually_edited = False`.

#### BUG-B12. Проблемы часовых поясов (`date.today()`) и отсутствие округления веса в профиле
* **Файл**: `backend/app/routers/profile.py` (строки 47, 61, 157), `backend/app/routers/meals.py` (строка 28), `backend/app/routers/stats.py` (строка 28).
* **В чём ошибка и почему возникает**:
  1. В `log_weight` (`profile.py`, строка 157) стоит условие `if target_date >= date.today(): current_user.current_weight_kg = round(weight_in.weight_kg, 1)`. Если сервер работает в UTC, а пользователь из часового пояса UTC-4 логирует вес вечером (когда по UTC уже наступило завтра), `target_date < date.today()` оказывается истинным, и `current_weight_kg` пользователя не обновляется.
  2. В `update_profile` (`profile.py`, строки 61, 65) `current_user.current_weight_kg` записывается в `WeightLog` без округления `round(..., 1)`.
* **Как исправить**:
  1. В `update_profile` округлять `current_weight_kg` (`round(float(value), 1)`).
  2. В `log_weight` обновлять `current_user.current_weight_kg` всегда, когда `target_date` является самой свежей датой в `weight_log` данного пользователя (или `target_date >= date.today() - timedelta(days=1)` при отсутствии более новых записей в `weight_log`).

#### BUG-B13. Отсутствие WAL-режима SQLite и конфликт воркеров в продакшене
* **Файл**: `backend/app/database.py` (строки 20–30) и `deploy/kalorii.service` (строка 10).
* **В чём ошибка и почему возникает**:
  В `database.py` при подключении к SQLite выполняется только `PRAGMA foreign_keys=ON`. При конкурентных запросах (например, когда на фронтенде параллельно запускается несколько фоновых AI-анализов блюд и сохранений) SQLite в стандартном режиме журнала блокирует базу (`database is locked`). Кроме того, в `deploy/kalorii.service` указано `--workers 2`, из-за чего два процесса одновременно выполняют `ALTER TABLE` и `seed_products` при старте и имеют раздельные словари `_rate_limit_records` в памяти.
* **Как исправить**:
  В `backend/app/database.py` в `set_sqlite_pragma` добавить включение WAL-режима и таймаута ожидания блокировки:
  ```python
  cursor = dbapi_connection.cursor()
  cursor.execute("PRAGMA foreign_keys=ON")
  cursor.execute("PRAGMA journal_mode=WAL")
  cursor.execute("PRAGMA synchronous=NORMAL")
  cursor.execute("PRAGMA busy_timeout=5000")
  cursor.close()
  ```

#### BUG-B14. Засорение таблицы `products` техническими клонами при создании быстрых рецептов
* **Файл**: `frontend/src/api/recipes.ts` (строки 49–85), `backend/app/schemas/recipe.py` и `backend/app/routers/recipes.py`.
* **В чём ошибка и почему возникает**:
  При вызове `recipesApi.createQuickRecipe` или `recipesApi.saveMealAsRecipe` фронтенд сначала создаёт кастомный продукт через `POST /api/products` с `category: 'Рецепты'`, а затем создаёт рецепт из одного этого продукта. Так как `GET /api/products` сортирует выдачу по `Product.is_custom.desc()`, все сохранённые из дневника рецепты засоряют обычный поиск продуктов, а при удалении рецепта (`DELETE /api/recipes/{id}`) эти технические продукты остаются в базе навсегда.
* **Как исправить**:
  1. В `RecipeCreate` (`backend/app/schemas/recipe.py`) добавить опциональные поля `total_calories`, `total_protein`, `total_fat`, `total_carbs`, `total_weight_grams`. В `create_recipe` (`backend/app/routers/recipes.py`), если `recipe_in.items` пуст и переданы прямые макросы, сохранять рецепт напрямую без создания фейкового `Product`.
  2. Дополнительно в `GET /api/products` (`backend/app/routers/products.py`) исключить технические продукты с `Product.category == 'Рецепты'` из общего поиска, если эта категория не запрошена явно.

### Раздел 1.2. Дизайнерские, версточные и фронтенд-ошибки

#### BUG-F01. Загруженный шрифт `Inter` перекрывается в `index.css`
* **Файл**: `frontend/src/index.css` (строка 23).
* **В чём ошибка и почему возникает**:
  В `frontend/index.html` подключается шрифт Google Fonts `Inter`, но в `frontend/src/index.css` для `html, body` указано:
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  ```
  Шрифт `'Inter'` пропущен в начале списка, поэтому браузер игнорирует загруженный веб-шрифт и рендерит системный шрифт.
* **Как исправить**:
  В `frontend/src/index.css` (строка 23) указать:
  ```css
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  ```

#### BUG-F02. Неработающий `tailwind.config.ts` в Tailwind v4 и несуществующие классы `safe-bottom` и `py-0.2`
* **Файл**: `frontend/src/index.css` (строка 1), `frontend/src/components/layout/BottomNav.tsx` (строка 12), `frontend/src/components/settings/AISettingsCard.tsx` (строка 319).
* **В чём ошибка и почему возникает**:
  1. В Tailwind CSS v4 при использовании `@import "tailwindcss";` файл `tailwind.config.ts` не подхватывается автоматически без директивы `@config "../tailwind.config.ts";`.
  2. В `BottomNav.tsx` (строка 12) у `<nav>` указан класс `safe-bottom`, которого не существует ни в Tailwind, ни в `index.css` (в `index.css` есть только `.pb-safe`).
  3. В `AISettingsCard.tsx` (строка 319) указан несуществующий класс `py-0.2`.
* **Как исправить**:
  1. В `frontend/src/index.css` добавить `@config "../tailwind.config.ts";` сразу после `@import "tailwindcss";` и добавить утилиту `.safe-bottom`:
     ```css
     .safe-bottom {
       padding-bottom: calc(0.375rem + env(safe-area-inset-bottom, 0px));
     }
     ```
  2. В `AISettingsCard.tsx` (строка 319) заменить `py-0.2` на `py-0.5`.

#### BUG-F03. Наложение шапки на чёлку / Dynamic Island в iOS PWA
* **Файл**: `frontend/src/components/layout/Header.tsx` (строка 19) и `frontend/index.html` (строка 5).
* **В чём ошибка и почему возникает**:
  В `index.html` включён режим `apple-mobile-web-app-status-bar-style="black-translucent"`, при котором веб-приложение на iOS начинается от самого верхнего края экрана под статус-баром, но у `<header>` в `Header.tsx` нет верхнего safe-area отступа (`pt-safe`). Кроме того, в `index.html` стоит `maximum-scale=1.0, user-scalable=no`, что блокирует зум для слабовидящих.
* **Как исправить**:
  1. В `Header.tsx` добавить учёт `env(safe-area-inset-top, 0px)` в верхний отступ шапки (`pt-[max(0.875rem,env(safe-area-inset-top))]`).
  2. В `frontend/index.html` убрать `maximum-scale=1.0, user-scalable=no` из мета-тега `viewport`.

#### BUG-F04. Разная ширина контейнеров шапки, контента и нижней навигации
* **Файл**: `frontend/src/components/layout/Header.tsx` (строка 20), `frontend/src/components/layout/BottomNav.tsx` (строка 13), `frontend/src/components/layout/Layout.tsx` (строка 20).
* **В чём ошибка и почему возникает**:
  В `Header.tsx` и `BottomNav.tsx` внутренний контейнер ограничен `max-w-md` (`448px`), а в `Layout.tsx` у `<main>` задан `max-w-lg` (`512px`). На всех экранах шире 448px левая и правая границы карточек контента разъезжаются относительно шапки и нижнего бара.
* **Как исправить**:
  Заменить `max-w-md` на `max-w-lg` в `Header.tsx` (строка 20) и `BottomNav.tsx` (строка 13), чтобы все три уровня макета имели единую ширину `512px`.

#### BUG-F05. Обрезание выпадающего списка ингредиентов в `CreateRecipeModal.tsx`
* **Файл**: `frontend/src/components/recipes/CreateRecipeModal.tsx` (строки 263–300).
* **В чём ошибка и почему возникает**:
  Контейнер результатов поиска продуктов (`div` с классом `absolute left-0 right-0 top-full mt-1 ... max-h-40 overflow-y-auto z-20`) открывается вниз внутри скроллящегося тела модального окна (`overflow-y-auto overflow-x-hidden` в `Modal.tsx`) прямо над кнопками «Отмена / Сохранить рецепт». Из-за `overflow-y-auto` у родителя выпадающий список обрезается нижней границей модального окна.
* **Как исправить**:
  В `CreateRecipeModal.tsx` заменить абсолютное позиционирование (`absolute left-0 right-0 top-full`) на встроенный в поток блок (`mt-2 bg-[#202025] border border-neutral-700 rounded-xl max-h-44 overflow-y-auto shadow-lg`), чтобы он плавно раздвигал блок создания рецепта внутри модалки и никогда не обрезался.

#### BUG-F06. Отображение `0k ккал` в карточке «Всего» на странице статистики
* **Файл**: `frontend/src/pages/StatsPage.tsx` (строки 67–71).
* **В чём ошибка и почему возникает**:
  В карточке «Всего» выводится:
  ```tsx
  {Math.round((stats?.total_calories || 0) / 1000)}k <span className="text-[10px] text-neutral-400 font-normal">ккал</span>
  ```
  При выборе периода «Сегодня» (или если сумма калорий меньше 500 ккал) `Math.round(450 / 1000)` выводит **`0k ккал`**, а при 1490 ккал выводит **`1k ккал`**.
* **Как исправить**:
  Для значений меньше `10000` выводить точное целое число (например, `1 850 ккал`), а для значений `>= 10000` выводить с одним знаком после запятой (`{(totalCal / 1000).toFixed(1)}k ккал`):
  ```tsx
  const totalCal = Math.round(stats?.total_calories || 0)
  const formattedTotalCal = totalCal >= 10000
    ? `${(totalCal / 1000).toFixed(1)}k`
    : totalCal.toLocaleString('ru-RU')
  ```

#### BUG-F07. Несовпадение порогов выполнения цели в `CaloriesBarChart.tsx` и на бэкенде
* **Файл**: `frontend/src/components/stats/CaloriesBarChart.tsx` (строки 93–98) и `backend/app/routers/stats.py` (строка 88).
* **В чём ошибка и почему возникает**:
  На бэкенде день считается успешным (`goal_achieved = True`) при попадании в диапазон `0.85 <= day_cal / goal_target <= 1.15` (±15%). Однако в `CaloriesBarChart.tsx` проверка `isTargetMet` использует диапазон `0.9 <= ... <= 1.1` (±10%). В результате день с `112%` от нормы считается выполненным в KPI «Цель выполнена %», но на графике окрашивается в цвет недобора (`#34d399`).
* **Как исправить**:
  В `CaloriesBarChart.tsx` использовать поле `entry.goal_achieved` или единый диапазон `0.85`–`1.15`:
  ```tsx
  const isOver = targetCalories > 0 && entry.calories > targetCalories * 1.15
  const isTargetMet = entry.goal_achieved ?? (targetCalories > 0 && entry.calories >= targetCalories * 0.85 && entry.calories <= targetCalories * 1.15)
  ```

#### BUG-F08. Разные дефолтные цели и формулы расчёта КБЖУ на фронтенде и бэкенде
* **Файл**: `frontend/src/pages/TodayPage.tsx` (строки 25–28), `frontend/src/pages/ProfilePage.tsx` (строки 48–118), `frontend/src/pages/StatsPage.tsx` (строка 18).
* **В чём ошибка и почему возникает**:
  1. На бэкенде (`models/user.py`) дефолтные цели нового пользователя — `2000 / 140 / 70 / 250`, а во всех фолбэках фронтенда прописано `2200 / 140 / 73 / 275`.
  2. В `ProfilePage.tsx` (строка 65) при расчёте нормы `targetW < w` выбирает похудение даже при разнице `0.1 кг` (на бэкенде порог `0.5 кг`), а локальный fallback-расчёт в блоке `catch` (строки 83–109) считает по совершенно другой формуле (`-400 ккал` вместо `* 0.82`, белки `1.8` вместо `2.0`, жиры `0.9 г/кг` вместо `25%` от калорий).
* **Как исправить**:
  1. Привести дефолтные значения на фронтенде к единому стандарту бэкенда: `2000 / 140 / 70 / 250`.
  2. В `ProfilePage.tsx` синхронизировать порог `Math.abs(targetW - w) > 0.5` и формулу в блоке `catch` с функцией `calculate_nutrition_plan` из `backend/app/services/nutrition.py`.

#### BUG-F09. Ошибки склонения русских существительных с числительными
* **Файл**: `frontend/src/pages/TodayPage.tsx` (строки 90, 172), `frontend/src/pages/StatsPage.tsx` (строка 40), `frontend/src/components/barcode/RecentScannedShelf.tsx` (строка 127).
* **В чём ошибка и почему возникает**:
  Тернарные операторы вида `count === 1 ? 'день' : 'дней'` и `count === 1 ? 'запись' : 'записи'` дают грамматические ошибки: *«2 дней»*, *«5 записи»*, *«21 записи»*, *«2 продуктов»*, *«5 блюда»*.
* **Как исправить**:
  Создать универсальную утилиту `pluralizeRu(count: number, forms: [string, string, string]): string` в `frontend/src/utils/pluralize.ts`:
  ```ts
  export function pluralizeRu(n: number, forms: [string, string, string]): string {
    const abs = Math.abs(n) % 100
    const n1 = abs % 10
    if (abs > 10 && abs < 20) return forms[2]
    if (n1 > 1 && n1 < 5) return forms[1]
    if (n1 === 1) return forms[0]
    return forms[2]
  }
  ```
  И использовать её во всех местах:
  - `pluralizeRu(daysTracked, ['день', 'дня', 'дней'])`
  - `pluralizeRu(totalDisplayCount, ['запись', 'записи', 'записей'])`
  - `pluralizeRu(otherDatePendingCount, ['блюдо', 'блюда', 'блюд'])`
  - `pluralizeRu(items.length, ['продукт', 'продукта', 'продуктов'])`

#### BUG-F10. Нарушение хронологической сортировки блюд в `mealsStore.ts`
* **Файл**: `frontend/src/store/mealsStore.ts` (строки 97, 118, 250, 319, 396).
* **В чём ошибка и почему возникает**:
  Бэкенд (`GET /api/meals`) сортирует список блюд по `meal_time` по возрастанию (`08:30`, `13:00`, `19:00`). Но когда пользователь добавляет новое блюдо через `addMeal` или фоновый AI-анализ, оно вставляется в самое начало списка (`[newMeal, ...state.meals]`), нарушая хронологический порядок. А при редактировании времени или даты блюда в `updateMeal` список не пересортировывается и блюдо не убирается, если его дата изменилась.
* **Как исправить**:
  Добавить в `mealsStore.ts` вспомогательную функцию сортировки:
  ```ts
  function sortMealsByTime(meals: Meal[]): Meal[] {
    return [...meals].sort((a, b) => (a.meal_time || '').localeCompare(b.meal_time || ''))
  }
  ```
  Применять `sortMealsByTime` во всех местах обновления `meals` (`addMeal`, `updateMeal`, `startPhotoAIAnalysis`, `startTextAIAnalysis`, `retryPendingMeal`), а в `updateMeal` проверять `updated.meal_date === state.selectedDate` (если дата изменилась на другой день — удалять запись из массива текущего дня).

#### BUG-F11. Разный дефолтный порядок AI-моделей на фронтенде и бэкенде
* **Файл**: `frontend/src/components/settings/AISettingsCard.tsx` (строки 23–84) и `backend/app/services/ai_router.py` (строки 16–27).
* **В чём ошибка и почему возникает**:
  В `DEFAULT_MODEL_CHAIN` (`ai_router.py`) модели OpenRouter (`openrouter/auto`, `gemma-4-26b`, `gemma-4-31b`, `nemotron`) стоят на позициях 5–8 перед `gemini-3.7-flash` и `gemini-3.5-flash-lite`. А в `DEFAULT_AI_MODELS` (`AISettingsCard.tsx`) сначала идут все 6 моделей Gemini (позиции 1–6), а затем все модели OpenRouter (позиции 7–10).
* **Как исправить**:
  Синхронизировать порядок элементов в `DEFAULT_AI_MODELS` (`AISettingsCard.tsx`) с `DEFAULT_MODEL_CHAIN` (`backend/app/services/ai_router.py`).

#### BUG-F12. Оборванный сценарий серверного сканирования этикетки в `BarcodeScannerView.tsx`
* **Файл**: `frontend/src/components/barcode/BarcodeScannerView.tsx` (строки 338–371, 560–590) и `frontend/src/api/barcode.ts` (строки 25–32).
* **В чём ошибка и почему возникает**:
  Клиентский метод `barcodeApi.scanImage` (`POST /api/barcode/scan-image`) реализован в `api/barcode.ts`, но нигде не вызывается. Когда пользователь загружает фото упаковки/этикетки во вкладке «Скриншот» сканера штрихкодов, и локальный декодер ZXing не находит 1D-штрихкод, пользователю предлагается только кнопка «Распознать блюдо через AI», которая уводит его в режим обычного фото еды (`ai_photo`) вместо распознавания упаковки и сохранения товара в базу и полку «Недавно отсканированные». Также `barcodeApi.scanImage` не передаёт заголовки пользовательских ключей AI (`getAIHeaders()`).
* **Как исправить**:
  1. В `frontend/src/api/barcode.ts` в методе `scanImage` передавать `headers: getAIHeaders()`.
  2. В `BarcodeScannerView.tsx` в блоке `notFoundState` добавить кнопку **«Считать этикетку / упаковку через AI»**, которая вызывает `barcodeApi.scanImage(file)` и при успехе передаёт распознанный товар в `onProductFound(res.product)`.

#### BUG-F13. Ошибки кэширования в Service Worker (`frontend/public/sw.js`)
* **Файл**: `frontend/public/sw.js` (строки 32–52).
* **В чём ошибка и почему возникает**:
  Обработчик `fetch` перехватывает все запросы кроме `/api/`, включая `chrome-extension://`, запросы с методом `POST`/`PUT` (если не `/api/`) и пользовательские фотографии в `/uploads/`. Вызов `cache.put` на `non-GET` или `chrome-extension://` запросах выбрасывает `TypeError`, а кэширование `/uploads/` навсегда забивает память браузера удалёнными фотографиями.
* **Как исправить**:
  В начале обработчика `fetch` в `frontend/public/sw.js` добавить фильтр:
  ```js
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin) ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/uploads/')
  ) {
    return
  }
  ```

## Часть 2. Техническое задание на реализацию 4 новых функций

### FEAT-01. Мультикомпонентное AI-распознавание (разбивка сложного блюда на ингредиенты)

#### Пользовательская задача
Когда пользователь фотографирует сложную тарелку (например, «Гречка с куриной грудкой, яйцом и салатом») или описывает приём пищи текстом, нейросеть должна возвращать не только общие КБЖУ блюда, но и массив отдельных ингредиентов (`ingredients`). Пользователь должен иметь возможность прямо в карточке блюда или в модалке редактирования раскрыть состав по ингредиентам, изменить вес любого ингредиента (с автоматическим пропорциональным пересчётом его КБЖУ и суммы всего блюда) или удалить лишний ингредиент в один клик.

#### Изменения на бэкенде
1. **Схемы (`backend/app/schemas/ai.py` и `backend/app/schemas/meal.py`)**:
   - Создать схему ингредиента `MealIngredientItem`:
     ```python
     class MealIngredientItem(BaseModel):
         name: str = Field(..., min_length=1, max_length=255)
         weight_grams: float = Field(..., ge=0)
         calories: float = Field(..., ge=0)
         protein: float = Field(..., ge=0)
         fat: float = Field(..., ge=0)
         carbs: float = Field(..., ge=0)
     ```
   - Добавить поле `ingredients: List[MealIngredientItem] = Field(default_factory=list)` в `FoodAnalysisResult`, `FoodRecognitionResponse`, `MealCreate`, `MealUpdate` (`Optional[List[MealIngredientItem]] = None`) и `MealResponse`.
2. **Модель и БД (`backend/app/models/meal.py`, `backend/app/main.py`, `backend/alembic/versions/`)**:
   - В модель `Meal` (`backend/app/models/meal.py`) добавить колонку:
     ```python
     ingredients_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
     ```
   - Добавить на модели `Meal` вычисляемое свойство `@property def ingredients(self) -> list:` (и сеттер `@ingredients.setter`), которое парсит `self.ingredients_json` из JSON-строки в список словарей (и возвращает `[]`, если `None` или некорректный JSON), чтобы `MealResponse.model_validate(meal)` автоматически подхватывал список `ingredients`.
   - В `backend/app/main.py` в списке `ALTER TABLE` внутри `lifespan` добавить:
     `"ALTER TABLE meals ADD COLUMN ingredients_json TEXT"`
   - Создать миграцию `backend/alembic/versions/0004_add_meal_ingredients.py`, добавляющую колонку `ingredients_json` в таблицу `meals`.
3. **Промпты и парсер AI (`backend/app/utils/ai_providers/base.py`)**:
   - Обновить `build_system_prompt` и `build_text_prompt`, чтобы нейросеть возвращала массив `ingredients` для каждого распознанного компонента блюда:
     ```json
     {
       "name": "название всего блюда",
       "weight_grams": число,
       "calories": число,
       "protein": число,
       "fat": число,
       "carbs": число,
       "confidence": "high/medium/low",
       "ingredients": [
         {
           "name": "название ингредиента/компонента",
           "weight_grams": число,
           "calories": число,
           "protein": число,
           "fat": число,
           "carbs": число
         }
       ]
     }
     ```
   - В `parse_food_result(raw_json)` парсить массив `raw_json.get("ingredients")`: для каждого элемента валидировать числа через `_parse_float_safely`. Если массив `ingredients` содержит 2 и более позиций, проверять согласованность суммы: если расхождение суммы `ingredients` с общим `calories` больше 15%, пересчитывать итоговые `calories`, `protein`, `fat`, `carbs`, `weight_grams` как сумму компонентов.
4. **Роутеры (`backend/app/routers/ai.py` и `backend/app/routers/meals.py`)**:
   - В `/api/ai/recognize` и `/api/ai/analyze-text` передавать `ingredients=result.ingredients` в `FoodRecognitionResponse`.
   - В `create_meal`, `update_meal` и `recalculate_meal` сохранять `meal.ingredients_json = json.dumps([i.model_dump() for i in ingredients], ensure_ascii=False)`.

#### Изменения на фронтенде
1. **Типы (`frontend/src/types/index.ts`)**:
   - Добавить интерфейс `MealIngredient`:
     ```ts
     export interface MealIngredient {
       name: string
       weight_grams: number
       calories: number
       protein: number
       fat: number
       carbs: number
     }
     ```
   - Добавить `ingredients?: MealIngredient[]` в `Meal`, `CreateMealPayload`, `UpdateMealPayload` и `AIRecognitionResult`.
2. **Сохранение из AI (`frontend/src/store/mealsStore.ts`)**:
   - В `startPhotoAIAnalysis`, `startTextAIAnalysis` и `retryPendingMeal` передавать `ingredients: result.ingredients || []` при вызове `mealsApi.createMeal(...)`.
3. **Интерактивный редактор ингредиентов в `MealCard.tsx` и `EditMealModal.tsx`**:
   - В `MealCard.tsx`: если у блюда есть `meal.ingredients && meal.ingredients.length > 0`, отображать под строкой макросов компактную кнопку-переключатель `Состав (${meal.ingredients.length})` с иконкой шеврона (`onClick` с `e.stopPropagation()`).
   - При раскрытии блока состава прямо внутри `MealCard.tsx` показывать список ингредиентов. Для каждого ингредиента доступны:
     - Кнопки быстрого изменения веса (`-25г` / `+25г`) и поле ввода точного веса в граммах. При изменении веса ингредиента с `oldWeight` на `newWeight` его `calories`, `protein`, `fat`, `carbs` пересчитываются по коэффициенту `ratio = newWeight / (oldWeight || 100)`, а общие КБЖУ и вес блюда автоматически пересчитываются как сумма всех ингредиентов и сохраняются через `updateMeal`.
     - Кнопка удаления ингредиента (`X` / корзина) — удаляет компонент (например, если пользователь не съел соус или хлеб) и сразу пересчитывает общий итог блюда.
   - В `EditMealModal.tsx` также добавить секцию редактирования `ingredients` с возможностью менять вес каждого компонента, удалять компоненты, добавлять новый компонент вручную, а также переключатель **«Пересчитывать КБЖУ пропорционально общему весу»** при изменении общего веса блюда без ингредиентов.

### FEAT-02. Копирование приёмов пищи со вчерашнего дня и быстрый повтор («Повторить вчерашний завтрак»)

#### Пользовательская задача
Дать пользователю возможность за 1 клик повторять блюда со вчерашнего дня (или любого прошлого дня), а также повторять целый приём пищи (например, утренний набор блюд) без повторного фотографирования или поиска.

#### Изменения на бэкенде
1. **Новый эндпоинт копирования `POST /api/meals/{meal_id}/copy` (`backend/app/routers/meals.py` и `backend/app/schemas/meal.py`)**:
   - Добавить схему `MealCopyRequest` в `backend/app/schemas/meal.py`:
     ```python
     class MealCopyRequest(BaseModel):
         target_date: Optional[date] = None
         target_time: Optional[time] = None
     ```
   - В `backend/app/routers/meals.py` добавить роут `POST /{meal_id}/copy`, который находит исходный `Meal` текущего пользователя по `meal_id`, создаёт новую запись `Meal` со всеми полями (`name`, `calories`, `protein`, `fat`, `carbs`, `weight_grams`, `photo_path`, `user_comment`, `ingredients_json`, `ai_raw_response`, `is_manually_edited`), устанавливая `meal_date = copy_in.target_date or dt_date.today()` и `meal_time = copy_in.target_time or datetime.now().time().replace(microsecond=0)`.
   - Возвращает созданный `MealResponse` со статусом `201 Created`.

#### Изменения на фронтенде
1. **API и Стор (`frontend/src/api/meals.ts` и `frontend/src/store/mealsStore.ts`)**:
   - В `mealsApi` добавить метод `copyMeal(mealId: number, targetDate?: string, targetTime?: string): Promise<Meal>`.
   - В `mealsStore` добавить:
     - Поле `previousDayMeals: Meal[]` и метод `fetchPreviousDayMeals(currentSelectedDate: string): Promise<void>`, который вычисляет дату `currentSelectedDate - 1 день` и загружает её блюда через `mealsApi.getMeals(prevDate)`. Вызывать его параллельно с `fetchMeals`.
     - Метод `copyMealToDate(meal: Meal, targetDate?: string): Promise<Meal>`, который вызывает `mealsApi.copyMeal`, добавляет скопированное блюдо в текущий список с сортировкой по времени (если `targetDate === selectedDate`), пересчитывает `dailySummary` и показывает тост `✨ "${meal.name}" добавлено в дневник!`.
     - Метод `copyMultipleMealsToDate(mealsToCopy: Meal[], targetDate?: string): Promise<void>`, который копирует массив блюд (например, весь вчерашний завтрак) и показывает тост `✨ Скопировано блюд: ${mealsToCopy.length}`.
2. **Виджет быстрого повтора на `TodayPage.tsx`**:
   - Если у пользователя за предыдущий день есть записанные блюда (`previousDayMeals.length > 0`), отображать над списком приёмов пищи компактный блок **«Повторить со вчерашнего дня»**:
     - Если среди `previousDayMeals` есть утренние блюда (`meal_time` с `05:00` до `11:59`), выводить акцентную кнопку **«Повторить вчерашний завтрак (N блюд • X ккал)»**, которая копирует все блюда вчерашнего завтрака в текущий день одним нажатием.
     - Горизонтальная прокручиваемая лента компактных чипсов всех вчерашних блюд (`+ Название • X ккал`). Нажатие на любой чипс мгновенно копирует это блюдо в выбранный день.
3. **Кнопка быстрого копирования в `MealCard.tsx`**:
   - В выпадающем меню «3 точки» каждой карточки блюда добавить пункт с иконкой `Copy`:
     - Если просматривается сегодняшний день (`selectedDate === getTodayDateString()`): **«Повторить блюдо»** (создаёт копию в сегодняшнем дне на текущее время).
     - Если просматривается другой день: **«Скопировать в сегодня»** (копирует блюдо на сегодняшнюю дату `getTodayDateString()`).

### FEAT-03. Жесты свайпа (Swipe Actions) по карточке блюда и отмена удаления («Undo» в тосте)

#### Пользовательская задача
Сделать взаимодействие с карточками приёмов пищи на сенсорных экранах быстрым и безопасным: свайп влево удаляет запись без блокирующего `window.confirm()`, показывая тост с кнопкой **«Отменить» (Undo)** на 5 секунд; свайп вправо быстро дублирует (повторяет) блюдо в рацион.

#### Изменения на фронтенде
1. **Поддержка кнопки действия (`Undo`) в тостах (`frontend/src/store/uiStore.ts` и `frontend/src/components/ui/Toast.tsx`)**:
   - В `uiStore.ts` расширить интерфейс `ToastItem`:
     ```ts
     export interface ToastAction {
       label: string
       onClick: () => void
     }
     export interface ToastItem {
       id: string
       message: string
       type: ToastType
       duration?: number
       action?: ToastAction
     }
     ```
   - Обновить сигнатуру `addToast(message: string, type?: ToastType, duration?: number, action?: ToastAction): void`. При передаче `action` не блокировать показ тоста дедупликацией по тексту, а заменять предыдущий тост с тем же сообщением.
   - В `Toast.tsx`: если у `toast.action` передан объект, рендерить рядом с кнопкой закрытия заметную кнопку действия (`px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer shrink-0`), при клике на которую вызывается `toast.action.onClick()` и `removeToast(toast.id)`.
2. **Оптимистичное удаление с отложенным коммитом и отменой (`frontend/src/store/mealsStore.ts`)**:
   - Добавить в `mealsStore` метод `deleteMealWithUndo(id: number)`:
     1. Находит удаляемое блюдо в `state.meals`, сохраняет его копию и немедленно убирает его из `state.meals` с пересчётом `state.dailySummary`.
     2. Запускает таймер `const timerId = setTimeout(async () => { ... }, 5000)`, который через 5 секунд отправляет реальный `await mealsApi.deleteMeal(id)`.
     3. Вызывает `useUIStore.getState().addToast(\`Удалено: "${meal.name}"\`, 'info', 5000, { label: 'Отменить', onClick: () => { clearTimeout(timerId); /* вернуть meal обратно в state.meals с хронологической сортировкой и обновить dailySummary */ } })`.
     4. Если по истечении 5 секунд `mealsApi.deleteMeal(id)` вернул ошибку сервера — возвращает блюдо обратно в стейт и показывает тост с ошибкой.
3. **Жесты свайпа в `frontend/src/components/meals/MealCard.tsx`**:
   - Обернуть карточку `MealCard` в контейнер `relative overflow-hidden rounded-2xl select-none`.
   - Под карточкой разместить фоновый слой с двумя зонами действий:
     - Слева (открывается при свайпе вправо, `translateX > 0`): изумрудный фон (`bg-emerald-600/90`) с иконкой `Copy` и подписью **«Повторить»**.
     - Справа (открывается при свайпе влево, `translateX < 0`): гранатово-красный фон (`bg-rose-600/90`) с иконкой `Trash2` и подписью **«Удалить»**.
   - Реализовать обработчики `onTouchStart`, `onTouchMove`, `onTouchEnd`:
     - Фиксировать начальные координаты `startX`, `startY` и направление свайпа.
     - Если в начале движения `Math.abs(deltaY) > Math.abs(deltaX)` — считать жест вертикальным скроллом страницы и не смещать карточку.
     - Если жест горизонтальный (`Math.abs(deltaX) > 12`), плавно смещать карточку по оси X с ограничением (`Math.max(-108, Math.min(108, deltaX))`).
     - При отпускании пальца (`onTouchEnd`):
       - Если `deltaX <= -72`: вызвать `deleteMealWithUndo(meal.id)` (и короткий отклик `navigator.vibrate?.(35)`).
       - Если `deltaX >= 72`: вызвать `copyMealToDate(meal, selectedDate)` (быстрый повтор блюда), вызвать `navigator.vibrate?.(35)` и вернуть карточку в `translateX(0)`.
       - Иначе плавно вернуть карточку в `0`.
   - Заменить старый `handleDelete` с `window.confirm` в меню «3 точки» на вызов `deleteMealWithUndo(meal.id)`.

### FEAT-04. Интерактивная полоса недели (Week Strip Calendar) с индикаторами прогресса в шапке дневника

#### Пользовательская задача
Заменить одиночный переключатель дня на странице `TodayPage.tsx` на информативную интерактивную полосу из 7 дней недели (Пн–Вс) с мини-индикаторами (колечками) выполнения дневной нормы калорий под каждым днём, чтобы пользователь сразу видел картину всей недели и переключался между днями в одно касание.

#### Изменения на фронтенде
1. **Создание компонента `frontend/src/components/meals/WeekStripCalendar.tsx`**:
   - Принимает `selectedDate: string`, `onSelectDate: (date: string) => void`, `currentDayCalories: number`, `dailyGoalCalories: number`.
   - Вычисляет понедельник (`mondayStr`) и воскресенье (`sundayStr`) для недели (Пн–Вс), в которую входит `selectedDate`.
   - При смене недели (`mondayStr` / `sundayStr`) запрашивает статистику за эти 7 дней через `statsApi.getStats('custom', mondayStr, sundayStr)` и сохраняет карту калорий по датам `Record<string, number>`.
   - Для текущего выбранного дня (`dateStr === selectedDate`) берёт актуальное значение напрямую из пропа `currentDayCalories` (`totals.calories` из `useMealsStore`), чтобы колечко выбранного дня мгновенно обновлялось при добавлении, редактировании или удалении блюд без повторного запроса к `/api/stats`.
   - Верхняя строка компонента содержит:
     - Кнопку `ChevronLeft` — переключает на предыдущую неделю (`shiftDate(-7)` или `-1 день`).
     - Название месяца и дату выбранного дня (например, `Сегодня, 13 октября, вт`) с иконкой `Calendar`.
     - Кнопку **«Сегодня»**, если `selectedDate !== todayStr`.
     - Кнопку `ChevronRight` — переключает на следующую неделю/день.
   - Нижняя строка компонента содержит сетку `grid-cols-7 gap-1.5` для 7 дней недели (`Пн`, `Вт`, `Ср`, `Чт`, `Пт`, `Сб`, `Вс`):
     - Каждая ячейка — кнопка с короткой меткой дня недели (`Пн`..`Вс`), числом месяца и миниатюрным SVG-колечком прогресса (`22x22px`, `strokeWidth = 2.5`) под числом:
       - `calories === 0` (нет записей): серое трек-кольцо `#27272a`.
       - `calories > dailyGoalCalories * 1.15` (перебор): янтарное кольцо `#f59e0b`.
       - `calories >= dailyGoalCalories * 0.85 && calories <= dailyGoalCalories * 1.15` (норма выполнена): изумрудное кольцо `#10b981` с маленькой изумрудной точкой в центре.
       - `calories > 0 && calories < dailyGoalCalories * 0.85` (в процессе набора): бирюзово-изумрудное кольцо `#34d399`, заполненное на `(calories / dailyGoalCalories) * 100%`.
     - Выбранный день (`dateStr === selectedDate`) выделяется рамкой и подсветкой `bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm`, а сегодняшний день (`dateStr === todayStr`), если не выбран, подсвечивается изумрудным цветом числа и точкой сверху.
2. **Интеграция в `frontend/src/pages/TodayPage.tsx`**:
   - Заменить старый блок `Date Navigation Bar` в начале `TodayPage.tsx` на `<WeekStripCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} currentDayCalories={totals.calories} dailyGoalCalories={dailyGoalCalories} />`.

## Чек-лист проверки для ИИ-агента после выполнения

1. **Тесты бэкенда**: запусти `pytest` в папке `backend/` и убедись, что все существующие и новые тесты проходят без ошибок.
2. **Проверка типов и сборка фронтенда**: выполни `cd frontend && npm run build` (включает `tsc -b` и `vite build`), убедись в отсутствии ошибок TypeScript и скопируй собранные ассеты из `frontend/dist/` в `backend/static/`.
3. **Проверка миграций**: убедись, что при старте `uvicorn app.main:app` на существующей базе `db.sqlite3` колонка `ingredients_json` и `PRAGMA journal_mode=WAL` применяются без ошибок.
