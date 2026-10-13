# 🔧 KaloriiAI — Deployment & Operations

> Инструкции по деплою, обновлению и обслуживанию на сервере.

---

## Сервер

| Параметр | Значение |
|---|---|
| IP | 62.60.186.12 |
| Локация | Швеция |
| ОС | Ubuntu 26.04 |
| CPU | 1 ядро |
| RAM | 3.8 GB |
| Домен | kalorii.lopni.fun |
| TLS | Caddy (автоматический ACME через Cloudflare DNS) |

---

## Структура на сервере

```
/opt/kalorii/
├── backend/          # Код бэкенда
├── venv/             # Python virtualenv
├── data/
│   └── db.sqlite3    # База данных
├── uploads/          # Загруженные фото
└── .env              # Секреты

/var/www/kalorii/     # Собранный React фронтенд
```

---

## Порты

| Сервис | Порт | Статус |
|---|---|---|
| Caddy (HTTPS) | 443 | Общий |
| KaloriiAI Backend | 5100 | Только localhost |
| VPN сервисы | 2053, 2222, 8443, 39851 | Занято |

---

## Деплой (первый раз)

```bash
# На сервере:
sudo useradd -r -s /bin/nologin kalorii
sudo mkdir -p /opt/kalorii /var/www/kalorii
sudo chown kalorii:kalorii /opt/kalorii

# Скопировать backend/
scp -r backend/ root@62.60.186.12:/opt/kalorii/backend/

# Создать venv
cd /opt/kalorii
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Настроить .env
cp backend/.env.example .env
nano .env  # Заполнить ключи

# Миграции
cd backend
alembic upgrade head

# Systemd
sudo cp deploy/kalorii.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kalorii

# Caddy — добавить блок в Caddyfile
sudo nano /etc/caddy/Caddyfile  # Добавить блок из deploy/Caddyfile.kalorii
sudo systemctl reload caddy

# Фронтенд
cd frontend
npm run build
sudo cp -r dist/* /var/www/kalorii/
```

---

## Обновление

```bash
# Быстрый деплой
./deploy/deploy.sh
```

Или вручную:
```bash
# Backend
scp -r backend/ root@62.60.186.12:/opt/kalorii/backend/
ssh root@62.60.186.12 "cd /opt/kalorii && source venv/bin/activate && pip install -r backend/requirements.txt && cd backend && alembic upgrade head && sudo systemctl restart kalorii"

# Frontend
cd frontend && npm run build
scp -r dist/* root@62.60.186.12:/var/www/kalorii/
```

---

## Бэкап

```bash
# База данных (один файл!)
scp root@62.60.186.12:/opt/kalorii/data/db.sqlite3 ./backup/

# Фото
scp -r root@62.60.186.12:/opt/kalorii/uploads/ ./backup/uploads/
```

---

## Мониторинг

```bash
# Статус сервиса
sudo systemctl status kalorii

# Логи
sudo journalctl -u kalorii -f

# Проверить API
curl https://kalorii.lopni.fun/api/auth/me
```
