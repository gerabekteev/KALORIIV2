# 📡 KaloriiAI — API Reference

> Полная справка по API эндпоинтам бэкенда.
> Swagger UI также доступен по адресу: `http://localhost:5100/docs`

---

## Базовый URL

- **Разработка:** `http://localhost:5100/api`
- **Продакшен:** `https://kalorii.lopni.fun/api`

## Аутентификация

Все защищённые эндпоинты требуют заголовок:
```
Authorization: Bearer <access_token>
```

---

## 1. Auth — Аутентификация

### POST `/api/auth/register`
Регистрация нового пользователя.

**Body (JSON):**
```json
{
  "email": "user@example.com",
  "name": "Имя",
  "password": "минимум 6 символов"
}
```

**Response 201:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Имя",
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### POST `/api/auth/login`
Вход в аккаунт.

**Body (JSON):**
```json
{
  "email": "user@example.com",
  "password": "пароль"
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

### POST `/api/auth/refresh`
Обновить access token.

**Body (JSON):**
```json
{
  "refresh_token": "eyJ..."
}
```

### GET `/api/auth/me`
Получить текущего пользователя. 🔒 Требует авторизации.

---

## 2. Meals — Приёмы пищи

### GET `/api/meals?date=2026-10-13`
Список еды за указанную дату. 🔒

**Query params:**
- `date` (string, YYYY-MM-DD) — дата, по умолчанию сегодня

**Response 200:** `Meal[]`

### POST `/api/meals`
Добавить приём пищи. 🔒

**Body (JSON):**
```json
{
  "name": "Овсянка с бананом",
  "calories": 320,
  "protein": 12,
  "fat": 8,
  "carbs": 52,
  "weight_grams": 250,
  "meal_date": "2026-10-13",
  "meal_time": "09:30",
  "photo_path": null,
  "user_comment": null,
  "ai_raw_response": null,
  "is_manually_edited": false
}
```

### PUT `/api/meals/{id}`
Редактировать приём пищи. 🔒

### DELETE `/api/meals/{id}`
Удалить приём пищи. 🔒

---

## 3. AI — Распознавание еды

### POST `/api/ai/recognize`
Загрузить фото еды для AI-распознавания. 🔒

**Body (multipart/form-data):**
- `image` (file) — фото еды (image/*, max 10MB)
- `comment` (string, optional) — пояснение пользователя

**Response 200:**
```json
{
  "name": "Гречка с курицей",
  "weight_grams": 300,
  "calories": 345,
  "protein": 38,
  "fat": 8,
  "carbs": 42,
  "confidence": "high",
  "provider": "gemini-3.8-flash"
}
```

**Rate limit:** 10 запросов в минуту на пользователя.

---

## 4. Products — Продукты

### GET `/api/products?search=куриц`
Поиск продуктов по названию. 🔒

### POST `/api/products`
Добавить свой продукт. 🔒

**Body (JSON):**
```json
{
  "name": "Мой продукт",
  "calories_per_100g": 150,
  "protein_per_100g": 20,
  "fat_per_100g": 5,
  "carbs_per_100g": 10,
  "category": "мясо"
}
```

---

## 5. Recipes — Рецепты

### GET `/api/recipes`
Список рецептов текущего пользователя. 🔒

### POST `/api/recipes`
Создать рецепт. 🔒

### PUT `/api/recipes/{id}/favorite`
Добавить/убрать из избранного. 🔒

---

## 6. Stats — Статистика

### GET `/api/stats?period=week`
Статистика за период. 🔒

**Query params:**
- `period`: `today`, `week`, `month`, `custom`
- `start_date` (string, optional) — для custom
- `end_date` (string, optional) — для custom

**Response 200:**
```json
{
  "period": "week",
  "days": [...],
  "totals": {
    "avg_calories": 1850,
    "avg_protein": 120,
    "avg_fat": 65,
    "avg_carbs": 230
  },
  "goals_met_percent": 71
}
```

### GET `/api/stats/weight`
Журнал веса. 🔒

---

## 7. Profile — Профиль

### GET `/api/profile`
Получить профиль. 🔒

### PUT `/api/profile`
Обновить профиль и цели КБЖУ. 🔒

### POST `/api/profile/calculate`
Авторасчёт нормы КБЖУ по формуле Mifflin-St Jeor. 🔒

**Body (JSON):**
```json
{
  "height_cm": 175,
  "current_weight_kg": 80,
  "age": 25,
  "gender": "male",
  "activity_level": "moderate",
  "goal": "lose"
}
```

**Response 200:**
```json
{
  "daily_calories_goal": 2200,
  "daily_protein_goal": 140,
  "daily_fat_goal": 73,
  "daily_carbs_goal": 275,
  "bmr": 1754,
  "tdee": 2719
}
```

### POST `/api/profile/weight`
Записать вес. 🔒

**Body (JSON):**
```json
{
  "weight_kg": 79.5,
  "log_date": "2026-10-13"
}
```

### GET `/api/profile/ai-settings`
Получить сохранённые приоритеты AI моделей и кастомные API-ключи пользователя. 🔒

### PUT `/api/profile/ai-settings`
Сохранить персональный порядок приоритета AI моделей и API-ключи в БД. 🔒

---

## 7. Barcode — Штрихкоды и «Честный Знак»

### POST `/api/barcode/lookup`
Поиск продукта по линейному штрихкоду (EAN-13, EAN-8, UPC) или 2D DataMatrix коду маркировки «Честный Знак». 🔒
Сначала выполняет поиск в локальной БД, затем запрашивает Open Food Facts API и автоматически кэширует найденный продукт.

**Body (JSON):**
```json
{
  "barcode": "4607025140019"
}
```

**Response 200:**
```json
{
  "product_id": 42,
  "name": "Молоко 3.2%",
  "brand": "Простоквашино",
  "barcode": "4607025140019",
  "calories_per_100g": 59.0,
  "protein_per_100g": 3.0,
  "fat_per_100g": 3.2,
  "carbs_per_100g": 4.7,
  "package_weight_grams": 950.0,
  "image_url": "https://images.openfoodfacts.org/...",
  "source": "openfoodfacts",
  "is_honest_sign": true
}
```

### POST `/api/barcode/scan-image`
Анализ фото упаковки или скриншота со штрихкодом через AI Vision каскад. 🔒
Форма `multipart/form-data` с полем `photo`.

### GET `/api/barcode/recent`
Получить список недавно отсканированных товаров текущего пользователя для быстрой полки. 🔒

### DELETE `/api/barcode/recent/{product_id}`
Удалить товар из полки недавних сканирований. 🔒

---

## Коды ошибок

| Код | Описание |
|---|---|
| 400 | Неверный запрос (валидация) |
| 401 | Не авторизован |
| 403 | Доступ запрещён |
| 404 | Не найдено |
| 413 | Файл слишком большой |
| 422 | Ошибка валидации (Pydantic) |
| 429 | Слишком много запросов (rate limit) |
| 500 | Внутренняя ошибка сервера |
| 503 | Все AI модели недоступны |
