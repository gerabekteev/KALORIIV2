#!/usr/bin/env bash
set -euo pipefail

PATCH_FILE="${1:-kalorii-updates.patch}"

if [ ! -f "$PATCH_FILE" ]; then
  echo "Ошибка: файл патча '$PATCH_FILE' не найден в текущей папке."
  echo "Положите kalorii-updates.patch в корень вашего репозитория и запустите:"
  echo "  bash apply-kalorii-updates.sh"
  exit 1
fi

echo "=== 1/3. Применение Git-коммитов из $PATCH_FILE ==="
if git am --3way --ignore-whitespace "$PATCH_FILE"; then
  echo "✅ Все 4 коммита успешно применены через git am!"
else
  echo "⚠️ Откат git am и применение напрямую через git apply..."
  git am --abort 2>/dev/null || true
  git apply --ignore-whitespace "$PATCH_FILE"
  git add -A
  git commit -m "feat: apply KaloriiAI backend/frontend fixes and 4 new features"
  echo "✅ Изменения успешно применены и закоммичены!"
fi

echo "=== 2/3. Пересборка фронтенда и обновление backend/static (опционально) ==="
if command -v npm >/dev/null 2>&1 && [ -d "frontend" ]; then
  (
    cd frontend
    npm install
    npm run build
  )
  mkdir -p backend/static
  rm -rf backend/static/assets
  cp -r frontend/dist/* backend/static/
  if ! git diff --quiet backend/static; then
    git add backend/static
    git commit -m "chore(static): update prebuilt frontend bundle in backend/static"
  fi
  echo "✅ Фронтенд пересобран и синхронизирован с backend/static!"
else
  echo "ℹ️ npm не найден локально — фронтенд будет автоматически собран в Docker при деплое."
fi

echo "=== 3/3. Готово к отправке в GitHub ==="
echo "Выполните команду для отправки коммитов в ваш репозиторий:"
echo "  git push origin main"
