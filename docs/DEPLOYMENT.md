# 🔧 KaloriiAI — Deployment & Operations

> Инструкции по деплою, обновлению и обслуживанию на сервере в контейнерной среде Docker + Caddy.

---

## Сервер

| Параметр | Значение |
|---|---|
| IP целевого сервера | `62.60.186.12` |
| Jump host (промежуточный) | `194.48.140.56` (`fi` в ~/.ssh/config) |
| Доступ | `ssh -o StrictHostKeyChecking=no -J fi root@62.60.186.12` |
| Локация | Швеция (Стокгольм) |
| ОС | Ubuntu 26.04 minimal |
| Архитектура деплоя | Docker Compose + Caddy Reverse Proxy (`caddy:2-alpine`) |
| Домен | `kalorii.lopni.fun` |
| TLS | Прямой автоматический Let's Encrypt через Caddy (DNS only / серое облако) |

---

## Архитектура контейнеров на сервере

```
Интернет (HTTPS :443 / HTTP :80)
            │
            ▼
┌────────────────────────────────────────────────────────┐
│  Docker Container: caddy (caddy:2-alpine)             │
│  Сеть: remnawave-network                               │
│  Конфиг: /opt/caddy-remnawave/Caddyfile               │
└───────────────────────┬────────────────────────────────┘
                        │
                        │ Внутренняя маршрутизация по Docker DNS
                        ▼
┌────────────────────────────────────────────────────────┐
│  Docker Container: kalorii (python:3.12-slim)         │
│  Сеть: remnawave-network                               │
│  Порт: kalorii:5100 (также опубликован на 127.0.0.1:5100)
│  Директория: /opt/kalorii                              │
│  Volumes:                                              │
│    - kalorii-data    -> /app/backend/data              │
│    - kalorii-uploads -> /app/backend/uploads           │
│  Frontend SPA + API в одном процессе Uvicorn/FastAPI   │
└────────────────────────────────────────────────────────┘
```

---

## Быстрый деплой и запуск

### 1. Клонирование / обновление на сервере

```bash
ssh -J fi root@62.60.186.12
cd /opt
if [ ! -d "/opt/kalorii" ]; then
    git clone https://github.com/gerabekteev/KALORIIV2.git kalorii
    cd kalorii
else
    cd kalorii
    git pull origin main
fi
```

### 2. Настройка окружения (`/opt/kalorii/backend/.env`)

```bash
cat << 'EOF' > /opt/kalorii/backend/.env
PROJECT_NAME="KaloriiAI"
DEBUG=false
DATABASE_URL=sqlite+aiosqlite:////app/backend/data/db.sqlite3
JWT_SECRET=super_secure_jwt_secret_kalorii_production_2026
GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
CORS_ORIGINS=["https://kalorii.lopni.fun","http://localhost:5100"]
UPLOAD_DIR=/app/backend/uploads
RATE_LIMIT_AI_PER_MINUTE=10
EOF
```

### 3. Запуск контейнера KaloriiAI

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Настройка Caddy на сервере

В файл `/opt/caddy-remnawave/Caddyfile` добавляется блок:

```caddyfile
kalorii.lopni.fun {
    encode zstd gzip

    reverse_proxy kalorii:5100 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Перезагрузка конфигурации Caddy (без даунтайма):
```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Проверка статуса и логи

```bash
# Проверка работы контейнера
docker ps | grep kalorii

# Просмотр логов в реальном времени
docker logs -f kalorii

# Локальная проверка здоровья изнутри сервера
curl -I http://127.0.0.1:5100/api/health

# Проверка через HTTPS домен
curl -I https://kalorii.lopni.fun/api/health
```

---

## Бэкап базы данных и фото

```bash
# Бэкап БД из Docker Volume
docker run --rm -v kalorii-data:/data -v /tmp:/backup alpine cp /data/db.sqlite3 /backup/kalorii-db-$(date +%Y%m%d).sqlite3

# Бэкап загрузок
docker run --rm -v kalorii-uploads:/uploads -v /tmp:/backup alpine tar -czf /backup/kalorii-uploads-$(date +%Y%m%d).tar.gz /uploads
```
