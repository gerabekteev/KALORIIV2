import os
import secrets
import logging
from pathlib import Path
from typing import List, Any
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRETS = {
    "kaloriiai_super_secure_jwt_secret_change_in_production_2026",
    "super_secure_jwt_secret_kalorii_production_2026",
    "replace_with_a_super_secret_jwt_key_at_least_32_characters_long",
    "changeme",
    "secret",
}

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General
    PROJECT_NAME: str = "KaloriiAI"
    API_V1_PREFIX: str = "/api"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = Field(
        default=f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'db.sqlite3'}",
        description="Async SQLite database connection string",
    )

    # JWT Authentication
    JWT_SECRET: str = Field(
        default="kaloriiai_super_secure_jwt_secret_change_in_production_2026",
        description="Secret key for JWT token encoding/decoding",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    @field_validator("JWT_SECRET", mode="after")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        clean = (v or "").strip()
        if clean in _INSECURE_DEFAULT_SECRETS or len(clean) < 32:
            import os
            is_test = bool(os.environ.get("PYTEST_CURRENT_TEST"))
            is_debug = os.environ.get("DEBUG", "false").lower() in ("true", "1")
            if not is_debug and not is_test:
                raise ValueError(
                    "CRITICAL SECURITY ERROR: Небезопасный или короткий JWT_SECRET в продакшене! "
                    "Задайте уникальный ключ (openssl rand -hex 32) в файле .env."
                )
            logging.getLogger("kalorii.config").warning(
                "ВНИМАНИЕ: Используется тестовый/дефолтный JWT_SECRET! В продакшене задайте уникальный ключ в .env."
            )
        return clean

    # AI API Keys & Proxy Configuration
    GEMINI_API_KEY: str = Field(default="", description="Google Gemini API key")
    OPENROUTER_API_KEY: str = Field(default="", description="OpenRouter API key")
    GEMINI_BASE_URL: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta/models",
        description="Base URL for Gemini API (can be overridden with a reverse proxy)",
    )
    GEMINI_PROXY_URL: str = Field(
        default="",
        description="Optional HTTP/SOCKS5 proxy URL for Gemini API (e.g. http://127.0.0.1:10808 or socks5://...)",
    )

    # Telegram Bot Integration
    TELEGRAM_BOT_TOKEN: str = Field(
        default="",
        description="Telegram Bot token from @BotFather (must be configured via .env)",
    )
    TELEGRAM_BOT_USERNAME: str = Field(
        default="KaloriiV2bot",
        description="Telegram Bot username (without @), e.g. KaloriiV2bot",
    )

    # Storage
    UPLOAD_DIR: Path = Field(
        default=BASE_DIR / "uploads",
        description="Directory for uploaded meal photos",
    )
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://kalorii.lopni.fun",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                import json
                try:
                    return json.loads(v_str)
                except Exception:
                    pass
            return [i.strip() for i in v_str.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    # Rate Limiting
    RATE_LIMIT_AI_PER_MINUTE: int = 10


settings = Settings()

# Ensure required directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
