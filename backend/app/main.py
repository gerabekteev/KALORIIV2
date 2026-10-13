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
from app.routers import auth, meals, products, recipes, stats, profile, ai, barcode
from scripts.seed_products import seed_products

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("kalorii.main")


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
        ]:
            try:
                await conn.execute(text(alter_sql))
            except Exception:
                pass

    # Seed products if empty
    async with AsyncSessionLocal() as session:
        try:
            seeded = await seed_products(session)
            if seeded > 0:
                logger.info(f"Initialized database with {seeded} seed products.")
        except Exception as e:
            logger.error(f"Error seeding database: {e}", exc_info=True)

    logger.info("KaloriiAI backend ready.")
    yield
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

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Allow API, docs, and uploads to pass through or 404
        if full_path.startswith(("api", "uploads", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        index_file = STATIC_DIR / "index.html"
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
