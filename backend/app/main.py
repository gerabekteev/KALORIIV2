import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.routers import auth, meals, products, recipes, stats, profile, ai
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


@app.get("/api/health", tags=["Служебные"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
    }


@app.get("/", tags=["Служебные"])
async def root():
    """Root redirect / welcome endpoint."""
    return {
        "message": "Добро пожаловать в API KaloriiAI!",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return consistent error structure."""
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Произошла внутренняя ошибка сервера. Пожалуйста, попробуйте позже."},
    )
