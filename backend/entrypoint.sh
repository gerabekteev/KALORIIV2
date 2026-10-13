#!/bin/sh
set -e

echo "=== Starting KaloriiAI Container ==="

# Apply migrations if alembic config exists
if [ -f "alembic.ini" ]; then
    echo "Running Alembic migrations..."
    python -m alembic upgrade head || echo "Alembic migrations completed or skipped."
fi

echo "Starting Uvicorn web server on 0.0.0.0:5100..."
exec uvicorn app.main:app --host 0.0.0.0 --port 5100
