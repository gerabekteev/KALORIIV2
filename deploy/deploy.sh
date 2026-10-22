#!/usr/bin/env bash
set -euo pipefail

# KaloriiAI Production Deployment Script
# Target domain: kalorii.lopni.fun
# Host: Ubuntu/Debian Linux with systemd & Caddy

APP_DIR="/var/www/kalorii"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
SERVICE_NAME="kalorii.service"

echo "=========================================="
echo " Starting KaloriiAI Production Deployment "
echo "=========================================="

# 1. Update source code
if [ -d "${APP_DIR}/.git" ]; then
    echo "[1/6] Pulling latest changes from git..."
    cd "${APP_DIR}"
    git pull origin main || git pull
else
    echo "[1/6] Git repository not detected in ${APP_DIR}, skipping git pull."
fi

# 2. Setup Python virtualenv and backend dependencies
echo "[2/6] Updating backend dependencies..."
cd "${BACKEND_DIR}"
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 3. Run database migrations
echo "[3/6] Running Alembic database migrations..."
python -m alembic upgrade head

# 4. Build Frontend assets
echo "[4/6] Installing frontend dependencies and building production bundle..."
cd "${FRONTEND_DIR}"
npm ci || npm install
npm run build:sync-static

# 5. Copy systemd service and restart backend
echo "[5/6] Updating systemd service..."
if [ -f "${APP_DIR}/deploy/${SERVICE_NAME}" ]; then
    sudo cp "${APP_DIR}/deploy/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}"
    sudo systemctl restart "${SERVICE_NAME}"
    echo "kalorii.service restarted successfully."
else
    echo "Warning: ${SERVICE_NAME} not found in deploy directory."
fi

# 6. Update Caddy configuration
echo "[6/6] Updating Caddy web server configuration..."
if [ -f "${APP_DIR}/deploy/Caddyfile.kalorii" ]; then
    if [ -d "/etc/caddy/sites-enabled" ]; then
        sudo cp "${APP_DIR}/deploy/Caddyfile.kalorii" "/etc/caddy/sites-enabled/kalorii.caddy"
        sudo systemctl reload caddy || sudo caddy reload --config /etc/caddy/Caddyfile
    fi
fi

# 7. Check backend health
echo "Checking backend health status..."
sleep 2
if curl -s -f http://127.0.0.1:5100/api/health > /dev/null; then
    echo " Health check passed! Deployment completed successfully."
else
    echo " Health check warning: backend did not respond immediately on 127.0.0.1:5100."
fi

echo "=========================================="
echo " KaloriiAI deployed to https://kalorii.lopni.fun "
echo "=========================================="
