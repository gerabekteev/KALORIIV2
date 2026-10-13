import time
from collections import defaultdict, deque
from typing import Optional, Dict
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status

from app.config import settings
from app.models.user import User
from app.schemas.ai import FoodRecognitionResponse
from app.services.auth import get_current_user
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.utils.image import save_uploaded_file, process_image

router = APIRouter(prefix="/ai", tags=["AI Распознавание"])

# In-memory sliding-window rate limiter per user_id: deque of timestamps
_rate_limit_records: Dict[int, deque] = defaultdict(deque)


def check_ai_rate_limit(user_id: int) -> None:
    """Enforce maximum requests per minute per user on AI endpoints."""
    now = time.time()
    window_seconds = 60.0
    max_requests = settings.RATE_LIMIT_AI_PER_MINUTE

    record = _rate_limit_records[user_id]

    # Remove timestamps older than 60 seconds
    while record and now - record[0] > window_seconds:
        record.popleft()

    if len(record) >= max_requests:
        retry_after = int(window_seconds - (now - record[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Превышен лимит запросов к AI (максимум {max_requests} в минуту). Пожалуйста, подождите {retry_after} сек.",
            headers={"Retry-After": str(retry_after)},
        )

    record.append(now)


@router.post("/recognize", response_model=FoodRecognitionResponse)
async def recognize_food_endpoint(
    photo: UploadFile = File(..., description="Фотография еды (JPEG, PNG, WebP)"),
    comment: Optional[str] = Form(None, description="Пояснение пользователя к фото (опционально)"),
    current_user: User = Depends(get_current_user),
):
    """
    Recognize food and estimate KBJU from an uploaded photo using AI.
    - Validates image MIME type and file size (max 10MB)
    - Compresses and stores the image in uploads directory
    - Processes with multi-provider AI fallback chain (Gemini & OpenRouter)
    - Rate limited to 10 requests per minute per user
    """
    # 1. Check rate limit
    check_ai_rate_limit(current_user.id)

    # 2. Save uploaded file to disk and get web URL path
    dest_path, relative_url_path = await save_uploaded_file(photo)

    # 3. Read compressed image bytes for AI provider
    with open(dest_path, "rb") as f:
        image_bytes = f.read()

    # 4. Invoke AI Router
    try:
        result, provider_name, model_id = await ai_router.recognize_food(
            image_bytes=image_bytes,
            mime_type="image/jpeg",
            user_comment=comment,
        )
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обработке запроса AI: {str(e)}",
        )

    return FoodRecognitionResponse(
        name=result.name,
        weight_grams=result.weight_grams,
        calories=result.calories,
        protein=result.protein,
        fat=result.fat,
        carbs=result.carbs,
        confidence=result.confidence,
        photo_path=relative_url_path,
        provider_used=provider_name,
        model_used=model_id,
        raw_response=None,
    )
