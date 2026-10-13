FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application code (including prebuilt static assets)
COPY backend/ /app/backend/

# Ensure entrypoint is executable and data dirs exist
RUN chmod +x /app/backend/entrypoint.sh && \
    mkdir -p /app/backend/data /app/backend/uploads

WORKDIR /app/backend

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:5100/api/health || exit 1

ENTRYPOINT ["/app/backend/entrypoint.sh"]
