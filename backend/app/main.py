import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from sqlalchemy import text
from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.routers import auth, meals, products, recipes, stats, profile, ai, barcode, meal_plan, telegram
from app.services.telegram_bot import telegram_bot_service
from app.utils.image import cleanup_orphan_uploads
from scripts.seed_products import seed_products

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("kalorii.main")


async def _periodic_orphan_cleanup() -> None:
    """Background task that cleans up orphan uploaded files every 12 hours."""
    while True:
        await asyncio.sleep(12 * 3600)
        try:
            async with AsyncSessionLocal() as session:
                cleaned = await cleanup_orphan_uploads(session, max_age_hours=24)
                if cleaned > 0:
                    logger.info(f"Periodic cleanup removed {cleaned} orphan upload files.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Error in periodic orphan cleanup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for application startup and shutdown."""
    logger.info("Initializing KaloriiAI application...")

    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for alter_sql in [
            "ALTER TABLE users ADD COLUMN ai_settings_json VARCHAR(4000)",
            "ALTER TABLE products ADD COLUMN barcode VARCHAR(100)",
            "ALTER TABLE products ADD COLUMN brand VARCHAR(255)",
            "ALTER TABLE products ADD COLUMN image_url VARCHAR(500)",
            "ALTER TABLE products ADD COLUMN package_weight_grams FLOAT DEFAULT 100.0",
            "ALTER TABLE meals ADD COLUMN ingredients_json TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_products_global_barcode_uniq ON products (barcode) WHERE is_custom = 0 AND barcode IS NOT NULL",
            "ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT",
            "ALTER TABLE users ADD COLUMN telegram_username VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN telegram_link_code VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN telegram_link_expires_at DATETIME",
            "ALTER TABLE users ADD COLUMN timezone VARCHAR(64) DEFAULT 'Europe/Moscow'",
            "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1",
            "ALTER TABLE user_scanned_products ADD COLUMN is_honest_sign BOOLEAN DEFAULT 0",
        ]:
            try:
                await conn.execute(text(alter_sql))
            except Exception:
                pass

    # Seed products if empty and clean orphan uploads
    async with AsyncSessionLocal() as session:
        try:
            seeded = await seed_products(session)
            if seeded > 0:
                logger.info(f"Initialized database with {seeded} seed products.")
        except Exception as e:
            logger.error(f"Error seeding database: {e}", exc_info=True)

        try:
            cleaned = await cleanup_orphan_uploads(session, max_age_hours=24)
            if cleaned > 0:
                logger.info(f"Cleaned up {cleaned} orphan upload files.")
        except Exception as e:
            logger.debug(f"Error during orphan uploads cleanup: {e}")

    cleanup_task = asyncio.create_task(_periodic_orphan_cleanup())
    tg_task = asyncio.create_task(telegram_bot_service.start_polling())
    logger.info("KaloriiAI backend ready.")
    try:
        yield
    finally:
        telegram_bot_service.stop()
        tg_task.cancel()
        cleanup_task.cancel()
        logger.info("Shutting down KaloriiAI application...")
        await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="KaloriiAI — Умный трекер калорий и макронутриентов (КБЖУ) с AI распознаванием еды",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static uploads directory for serving photos
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# Include API routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(meals.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(recipes.router, prefix=settings.API_V1_PREFIX)
app.include_router(stats.router, prefix=settings.API_V1_PREFIX)
app.include_router(profile.router, prefix=settings.API_V1_PREFIX)
app.include_router(ai.router, prefix=settings.API_V1_PREFIX)
app.include_router(barcode.router, prefix=settings.API_V1_PREFIX)
app.include_router(meal_plan.router, prefix=settings.API_V1_PREFIX)
app.include_router(telegram.router, prefix=settings.API_V1_PREFIX)


@app.get("/api/health", tags=["Служебные"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
    }


# Static frontend files and SPA client-side routing
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if not STATIC_DIR.exists():
    STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if STATIC_DIR.exists():
    from fastapi.responses import FileResponse
    STATIC_ROOT = STATIC_DIR.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        normalized = full_path.lstrip("/\\")
        if normalized.startswith(("api", "uploads", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")
        try:
            file_path = (STATIC_ROOT / normalized).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")
        if not file_path.is_relative_to(STATIC_ROOT):
            raise HTTPException(status_code=403, detail="Forbidden")
        if file_path.is_file():
            return FileResponse(file_path)
        index_file = STATIC_ROOT / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
else:
    @app.get("/", tags=["Служебные"])
    async def root():
        """Root redirect / welcome endpoint."""
        return {
            "status": "ok",
            "message": "Добро пожаловать в API KaloriiAI!",
            "docs": "/docs",
            "health": "/api/health",
        }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return consistent error structure."""
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Произошла внутренняя ошибка сервера. Пожалуйста, попробуйте позже."},
    )
