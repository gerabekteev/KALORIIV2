# 🥗 KaloriiAI (KALORIIV2)

> Веб-приложение для подсчёта калорий и макронутриентов (КБЖУ) с распознаванием еды по фото через AI.

## 🚀 Стек технологий

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Zustand, Recharts, PWA
- **Backend:** FastAPI (Python), SQLAlchemy + aiosqlite, Alembic (миграции), SQLite
- **AI Integration:** Multi-provider AI Router (Google Gemini, OpenRouter) для распознавания блюд по фото и текстовому описанию

## 📂 Структура проекта

```text
KALORIIV2/
├── backend/               # FastAPI бэкенд
│   ├── alembic/           # Миграции базы данных
│   ├── app/               # Исходный код API (модели, роутеры, сервисы AI)
│   ├── data/              # Локальная база данных SQLite
│   ├── scripts/           # Вспомогательные скрипты
│   ├── uploads/           # Загруженные фотографии еды
│   ├── .env.example       # Пример конфигурации окружения
│   └── requirements.txt   # Python зависимости
├── frontend/              # React + Vite клиент
│   ├── public/            # Статические файлы, манифест PWA
│   ├── src/               # Компоненты, хуки, стор, API клиент
│   └── package.json       # Node.js зависимости и скрипты
├── AI-MODELS-CATALOG.md   # Каталог поддерживаемых AI моделей
├── PLAN-KaloriiAI.md      # Детальный план архитектуры и roadmap
└── README.md
```

## 🛠️ Быстрый старт

### 1. Бэкенд (Backend)

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Отредактируйте .env и укажите ваши ключи API (GEMINI_API_KEY, OPENROUTER_API_KEY)

# Применение миграций
alembic upgrade head

# Запуск сервера
uvicorn app.main:app --reload --port 5100
```

### 2. Фронтенд (Frontend)

```bash
cd frontend
npm install
npm run dev
```

Приложение откроется по адресу: `http://localhost:5173`.
Бэкенд доступен по адресу: `http://localhost:5100` (Swagger документация: `http://localhost:5100/docs`).
