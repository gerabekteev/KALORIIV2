#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
ANDROID_DIR="${FRONTEND_DIR}/android"
KEYSTORE_PATH="${ANDROID_DIR}/app/kalorii-release-key.jks"

echo "=================================================="
echo " KaloriiAI — Сборка Web SPA + Подписанного APK    "
echo "=================================================="

# 1. Сборка фронтенда (один бандл работает и для Web, и для Android)
echo "[1/5] Сборка фронтенда (TypeScript + Vite)..."
cd "${FRONTEND_DIR}"
npm run build

# 2. Обновление статики для веб-сервера (backend/static)
echo "[2/5] Синхронизация статики для веб-версии (backend/static)..."
rm -rf "${ROOT_DIR}/backend/static/assets"
cp -r "${FRONTEND_DIR}/dist/"* "${ROOT_DIR}/backend/static/"

# 3. Синхронизация с Capacitor Android и генерация иконок
echo "[3/5] Синхронизация Capacitor Android и генерация иконок..."
npx cap sync android
python3 "${ROOT_DIR}/scripts/generate_android_icons.py" || python "${ROOT_DIR}/scripts/generate_android_icons.py" || true

# 4. Генерация ключа подписи (если ещё не создан)
if [ ! -f "${KEYSTORE_PATH}" ]; then
    echo "[4/5] Генерация ключа подписи Android APK (kalorii-release-key.jks)..."
    keytool -genkeypair -v \
        -keystore "${KEYSTORE_PATH}" \
        -alias kaloriiai \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass kaloriiai2026 \
        -keypass kaloriiai2026 \
        -dname "CN=KaloriiAI, OU=Mobile, O=KaloriiAI, L=Stockholm, S=Stockholm, C=SE"
else
    echo "[4/5] Ключ подписи ${KEYSTORE_PATH} уже существует."
fi

# 5. Компиляция подписанного Release APK через Gradle
echo "[5/5] Компиляция подписанного Android APK..."
cd "${ANDROID_DIR}"
chmod +x ./gradlew
./gradlew assembleRelease

APK_SOURCE="${ANDROID_DIR}/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "${APK_SOURCE}" ]; then
    APK_SOURCE="${ANDROID_DIR}/app/build/outputs/apk/release/app-release-unsigned.apk"
fi

cp "${APK_SOURCE}" "${ROOT_DIR}/kalorii-ai.apk"
cp "${APK_SOURCE}" "${ROOT_DIR}/backend/static/kalorii-ai.apk"

echo "=================================================="
echo " УСПЕШНО! Готовый APK сохранён в:"
echo " 1) ${ROOT_DIR}/kalorii-ai.apk"
echo " 2) ${ROOT_DIR}/backend/static/kalorii-ai.apk (доступен на сайте /kalorii-ai.apk)"
echo "=================================================="
