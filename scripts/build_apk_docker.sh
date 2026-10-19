#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
ANDROID_DIR="${FRONTEND_DIR}/android"
KEYSTORE_PATH="${ANDROID_DIR}/app/kalorii-release-key.jks"
BACKEND_STATIC_DIR="${ROOT_DIR}/backend/static"

echo "=================================================="
echo " KaloriiAI — Сборка Web SPA + APK через Docker    "
echo "=================================================="

# 1. Build Frontend
echo "[1/5] Сборка фронтенда (TypeScript + Vite)..."
cd "${FRONTEND_DIR}"
npm run build

# 2. Sync Web Assets to backend/static
echo "[2/5] Синхронизация статики для веб-сервера..."
rm -rf "${BACKEND_STATIC_DIR}/assets"
cp -r "${FRONTEND_DIR}/dist/"* "${BACKEND_STATIC_DIR}/"

# 3. Capacitor Sync & Android Icons
echo "[3/5] Синхронизация Capacitor Android и иконок..."
npx cap sync android
python3 "${ROOT_DIR}/scripts/generate_android_icons.py" || python "${ROOT_DIR}/scripts/generate_android_icons.py" || true

# 4. Keystore verification
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

# 5. Compile Signed Release APK in Docker container
echo "[5/5] Компиляция подписанного Release APK через Docker (ghcr.io/cirruslabs/android-sdk:35)..."
docker run --rm -v "${FRONTEND_DIR}:/frontend" -v kalorii-gradle-cache:/root/.gradle -w /frontend/android ghcr.io/cirruslabs/android-sdk:35 sh -c "yes | sdkmanager --licenses > /dev/null 2>&1 || true; sdkmanager 'platforms;android-36' > /dev/null 2>&1 || true; chmod +x ./gradlew; ./gradlew assembleRelease"

APK_SOURCE="${ANDROID_DIR}/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "${APK_SOURCE}" ]; then
    APK_SOURCE="${ANDROID_DIR}/app/build/outputs/apk/release/app-release-unsigned.apk"
fi

cp "${APK_SOURCE}" "${ROOT_DIR}/kalorii-ai.apk"
cp "${APK_SOURCE}" "${BACKEND_STATIC_DIR}/kalorii-ai.apk"

echo "=================================================="
echo " УСПЕШНО! Готовый APK сохранён в:"
echo " 1) ${ROOT_DIR}/kalorii-ai.apk"
echo " 2) ${BACKEND_STATIC_DIR}/kalorii-ai.apk"
echo "=================================================="
