# 🥗 KaloriiAI (Калории AI)

> **Умный трекер калорий и макронутриентов (КБЖУ) с распознаванием еды по фото с помощью нейросетей.**  
> Полнофункциональное веб-приложение (PWA) для автоматического и ручного учёта рациона, веса и достижения фитнес-целей.

---

## 🌟 Основные возможности

1. **AI-распознавание блюд по фото:**
   - Мультипровайдерный каскад нейросетей (**Google Gemini** + **OpenRouter**) с автоматическим fallback при недоступности или исчерпании квот.
   - Определение названия блюда, примерного веса в граммах и раскладки КБЖУ (калории, белки, жиры, углеводы).
   - Поддержка текстовых комментариев пользователя для уточнения состава.
   - Возможность ручной корректировки перед сохранением.

2. **Персональный расчёт КБЖУ:**
   - Формула **Миффлина — Сан Жеора** с учётом коэффициентов физической активности.
   - Цели: похудение (-15% калорий), поддержание формы, набор мышечной массы (+15% калорий).

3. **Дневник питания:**
   - Приёмы пищи с группировкой по датам и времени.
   - Индикаторы прогресса по калориям и макронутриентам относительно дневной нормы.
   - Редактирование и удаление записей.

4. **База продуктов и рецепты:**
   - Встроенная база популярных продуктов на русском языке (каши, мясо, рыба, молочные продукты, овощи, фрукты).
   - Быстрый поиск и добавление собственных продуктов.
   - Конструктор составных рецептов с автоматическим расчётом итогового КБЖУ и избранным.

5. **Трекинг веса и аналитика:**
   - Учёт динамики веса с сохранением истории.
   - Аналитика за день, неделю, месяц, год и произвольный период.
   - Графики потребления калорий и процентного соотношения макронутриентов на базе Recharts.

---

## 🛠️ Стек технологий

| Компонент | Технологии |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Zustand, Recharts, TanStack Query |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0 (asyncio + aiosqlite), Alembic, Pydantic v2 |
| **База данных** | SQLite с асинхронным драйвером `aiosqlite` |
| **AI Vision** | Google Gemini (3.8 Flash, 2.5 Flash, etc.) + OpenRouter Vision models |
| **Инфраструктура** | Caddy v2 (HTTPS/TLS, сжатие gzip/zstd), systemd, bash |

---

## 📂 Структура проекта

```text
KALORII/
├── backend/                   # FastAPI бэкенд
│   ├── alembic/               # Миграции базы данных (Alembic)
│   ├── app/
│   │   ├── config.py          # Конфигурация Pydantic Settings
│   │   ├── database.py        # Подключение к SQLite (AsyncEngine, SessionLocal)
│   │   ├── main.py            # Точка входа FastAPI, CORS, health check
│   │   ├── models/            # SQLAlchemy ORM модели (User, Meal, Product, Recipe, WeightLog)
│   │   ├── routers/           # API роутеры (auth, meals, products, recipes, stats, profile, ai)
│   │   ├── schemas/           # Pydantic DTO схемы
│   │   ├── services/          # Бизнес-логика (AI Router, Auth JWT, Nutrition)
│   │   └── utils/             # Адаптеры Gemini/OpenRouter, обработка изображений
│   ├── data/                  # Хранилище SQLite (db.sqlite3) и seed-данные
│   ├── uploads/               # Загруженные фотографии блюд
│   ├── requirements.txt       # Зависимости Python
│   ├── pytest.ini             # Конфигурация тестов
│   └── test_live_api.py       # Скрипт проверки live API
├── frontend/                  # React + Vite клиент
│   ├── public/                # Статические файлы, манифест PWA
│   ├── src/
│   │   ├── api/               # HTTP-клиент и методы API
│   │   ├── components/        # React компоненты интерфейса
│   │   ├── hooks/             # Кастомные хуки
│   │   ├── store/             # Zustand сторы состояния
│   │   ├── types/             # TypeScript интерфейсы и типы
│   │   ├── App.tsx            # Корневой компонент
│   │   └── main.tsx           # Точка входа Vite
│   └── package.json           # Зависимости npm
├── deploy/                    # Конфигурации для продакшн-деплоя
│   ├── Caddyfile.kalorii      # Конфигурация веб-сервера Caddy для kalorii.lopni.fun
│   ├── kalorii.service        # Unit-файл systemd для фонового запуска бэкенда
│   └── deploy.sh              # Скрипт автоматического обновления и деплоя
├── AI-MODELS-CATALOG.md       # Каталог и приоритеты поддерживаемых AI моделей
├── PLAN-KaloriiAI.md          # Детальный архитектурный план
└── README.md                  # Документация проекта
```

---

## 🚀 Быстрый запуск для разработки

### 1. Требования
- Python 3.11+
- Node.js 18+ и npm
- Git

### 2. Запуск бэкенда

```bash
cd backend

# Создание и активация виртуального окружения
# Windows:
python -m venv .venv
.\.venv\Scripts\activate

# Linux / macOS:
# python3 -m venv .venv
# source .venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Настройка переменных окружения
cp .env.example .env
# Заполните в .env ваши ключи: GEMINI_API_KEY и OPENROUTER_API_KEY

# Применение миграций базы данных
python -m alembic upgrade head

# Запуск сервера разработки
python -m uvicorn app.main:app --host 127.0.0.1 --port 5100 --reload
```

Бэкенд будет доступен по адресу: `http://127.0.0.1:5100`  
Интерактивная документация Swagger: `http://127.0.0.1:5100/docs`

### 3. Запуск фронтенда

```bash
cd frontend

# Установка пакетов
npm install

# Запуск dev-сервера
npm run dev
```

Фронтенд запустится на: `http://localhost:5173`.

---

## 🧪 Тестирование

### Запуск интеграционных тестов бэкенда:
```bash
cd backend
pytest
```

### Запуск проверки живых эндпоинтов:
```bash
cd backend
python test_live_api.py
```

### Проверка сборки фронтенда:
```bash
cd frontend
npm run build
```

---

## 🌐 API Спецификация

| Метод | URL | Описание |
|---|---|---|
| `GET` | `/` | Health check и приветственное сообщение |
| `GET` | `/api/health` | Проверка статуса сервиса |
| `POST` | `/api/auth/register` | Регистрация нового пользователя |
| `POST` | `/api/auth/login` | Авторизация и получение JWT |
| `POST` | `/api/auth/refresh` | Обновление пары токенов доступа |
| `GET` | `/api/auth/me` | Получение профиля текущего пользователя |
| `POST` | `/api/meals` | Добавление записи о приёме пищи |
| `GET` | `/api/meals?date=YYYY-MM-DD` | Список приёмов пищи и сумма КБЖУ за дату |
| `PUT` | `/api/meals/{id}` | Редактирование приёма пищи |
| `DELETE` | `/api/meals/{id}` | Удаление приёма пищи |
| `GET` | `/api/products?search=...` | Поиск продуктов по названию |
| `POST` | `/api/products` | Добавление пользовательского продукта |
| `GET` | `/api/recipes` | Список сохранённых рецептов |
| `POST` | `/api/recipes` | Создание рецепта из продуктов базы |
| `PUT` | `/api/recipes/{id}/favorite` | Добавление/удаление рецепта из избранного |
| `POST` | `/api/profile/calculate` | Расчёт суточных норм по Миффлину — Сан Жеору |
| `PUT` | `/api/profile` | Сохранение целевых норм и параметров профиля |
| `POST` | `/api/profile/weight` | Внесение замера веса |
| `GET` | `/api/stats?period=day|week|month|year` | Детальная статистика и процент достижения целей |
| `GET` | `/api/stats/weight` | История изменения веса |
| `POST` | `/api/ai/recognize` | AI-распознавание блюда по фотографии и комментарию |

---

## 📖 Документация для разработчиков и ИИ

В папке `docs/` и корне проекта сформирована полная база знаний:

| Файл | Описание |
|---|---|
| [`docs/AI-GUIDE.md`](docs/AI-GUIDE.md) | **Главный регламент для ИИ**. Правило оркестрации: для объёмных задач обязательно использовать субагентов-разработчиков и критиков; история волн разработки; конвенции проекта. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Все архитектурные решения и их обоснования (SQLite, React 19, FastAPI 5100, Caddy, Tailwind). |
| [`docs/API-REFERENCE.md`](docs/API-REFERENCE.md) | Полная спецификация REST API с примерами JSON запросов и ответов. |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Журнал версий и изменений (v0.1.0, v0.1.1, v1.0.0). |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Инструкция по установке и администрированию на сервере 62.60.186.12. |
| [`PLAN-KaloriiAI.md`](PLAN-KaloriiAI.md) | Исходный детальный план разработки проекта по фазам. |
| [`AI-MODELS-CATALOG.md`](AI-MODELS-CATALOG.md) | Каталог бесплатных моделей с Vision и правила каскадного fallback. |

---

## 🚢 Развёртывание на продакшн (kalorii.lopni.fun)

В каталоге `deploy/` подготовлены готовые скрипты и конфиги:
- `deploy/Caddyfile.kalorii` — конфигурация веб-сервера Caddy с автоматическим Let's Encrypt SSL-сертификатом, сжатием zstd/gzip и обратным прокси.
- `deploy/kalorii.service` — systemd unit для демонизации бэкенда с перезапуском при сбоях.
- `deploy/deploy.sh` — единый bash-скрипт деплоя.

### Шаги первого деплоя на сервере Ubuntu:

1. Клонируйте репозиторий в `/var/www/kalorii`:
   ```bash
   sudo git clone <REPO_URL> /var/www/kalorii
   sudo chown -R www-data:www-data /var/www/kalorii
   ```

2. Настройте файл окружения `/var/www/kalorii/backend/.env`:
   ```bash
   sudo cp /var/www/kalorii/backend/.env.example /var/www/kalorii/backend/.env
   sudo nano /var/www/kalorii/backend/.env
   ```

3. Запустите скрипт деплоя:
   ```bash
   sudo chmod +x /var/www/kalorii/deploy/deploy.sh
   sudo /var/www/kalorii/deploy/deploy.sh
   ```

4. Проверьте статус сервиса:
   ```bash
   sudo systemctl status kalorii.service
   ```

Сервис автоматически станет доступен по адресу: **`https://kalorii.lopni.fun`**.
