import json
import logging
import time
from collections import defaultdict, deque
from typing import Optional, Dict, Tuple, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, Header, HTTPException, status

from app.config import settings
from app.models.user import User
from app.schemas.ai import FoodRecognitionResponse, TextAnalysisRequest
from app.services.auth import get_current_user
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.utils.image import save_uploaded_file

logger = logging.getLogger("kalorii.ai_router")
router = APIRouter(prefix="/ai", tags=["AI Распознавание"])

# In-memory sliding-window rate limiter per user_id: deque of timestamps
_rate_limit_records: Dict[int, deque] = defaultdict(deque)
_last_rate_limit_cleanup: float = 0.0


def cleanup_stale_rate_limit_records(now: Optional[float] = None) -> None:
    """
    Prunes expired user entries from _rate_limit_records to prevent memory leaks.
    Removes keys where all timestamps are older than 60 seconds or deque is empty.
    """
    global _last_rate_limit_cleanup
    curr = now or time.time()
    window_seconds = 60.0

    stale_user_ids = [
        uid
        for uid, dq in list(_rate_limit_records.items())
        if not dq or (curr - dq[-1] > window_seconds)
    ]
    for uid in stale_user_ids:
        _rate_limit_records.pop(uid, None)

    _last_rate_limit_cleanup = curr


def check_ai_rate_limit(user_id: int) -> None:
    """
    Enforce maximum requests per minute per user on AI endpoints.
    Includes memory leak prevention by opportunistically pruning stale user records.
    """
    global _last_rate_limit_cleanup
    now = time.time()
    window_seconds = 60.0
    max_requests = settings.RATE_LIMIT_AI_PER_MINUTE

    # Opportunistically prune stale records every 30 seconds or if dict has grown large
    if (now - _last_rate_limit_cleanup > 30.0) or len(_rate_limit_records) > 200:
        cleanup_stale_rate_limit_records(now)

    record = _rate_limit_records[user_id]

    # Remove timestamps older than 60 seconds for current user
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


def _sanitize_api_key(key: Optional[str]) -> Optional[str]:
    """Sanitizes and validates an API key string, ignoring dummy/null values."""
    if not key or not isinstance(key, str):
        return None
    k = key.strip().strip("\"'")
    if not k or k.lower() in ("null", "undefined", "none", "false", "true", "0"):
        return None
    if len(k) < 8 or any(c.isspace() for c in k):
        return None
    return k


def _parse_custom_ai_models(x_ai_models: Optional[str]) -> Optional[List[Tuple[str, str]]]:
    """Helper to parse X-AI-Models header JSON and filter out disabled models."""
    if not x_ai_models:
        return None
    try:
        models_data = json.loads(x_ai_models)
        if isinstance(models_data, list):
            chain: List[Tuple[str, str]] = []
            for item in models_data:
                if isinstance(item, dict) and "provider" in item and "id" in item:
                    enabled = item.get("enabled", True)
                    # Filter out models where enabled is False, "false", 0, "0"
                    if enabled is False or str(enabled).lower() in ("false", "0"):
                        continue
                    prov = str(item["provider"]).strip().lower()
                    mod_id = str(item["id"]).strip()
                    if not prov or not mod_id:
                        continue
                    if prov == "openrouter":
                        if mod_id in ("openrouter-free", "openrouter-auto"):
                            mod_id = "openrouter/auto"
                        elif mod_id == "qwen-2.5-vl-72b":
                            mod_id = "qwen/qwen2.5-vl-72b-instruct:free"
                    chain.append((prov, mod_id))
            return chain
    except Exception as e:
        logger.debug(f"Could not parse custom X-AI-Models header: {e}")
    return None


def resolve_ai_config(
    current_user: Optional[User] = None,
    x_gemini_key: Optional[str] = None,
    x_openrouter_key: Optional[str] = None,
    x_ai_models: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], Optional[List[Tuple[str, str]]]]:
    """
    Resolve API keys and model chain taking into account request headers and user saved AI settings.
    Priority:
    1. Request headers (X-Gemini-Key, X-OpenRouter-Key, X-AI-Models)
    2. User saved settings in current_user.ai_settings_json
    3. Fallback to system default settings (None)
    """
    resolved_gemini = _sanitize_api_key(x_gemini_key)
    resolved_openrouter = _sanitize_api_key(x_openrouter_key)
    custom_chain = _parse_custom_ai_models(x_ai_models)

    if current_user and getattr(current_user, "ai_settings_json", None):
        try:
            user_data = json.loads(current_user.ai_settings_json)
            if isinstance(user_data, dict):
                # Fallback for Gemini key if not provided via header
                if not resolved_gemini:
                    gem_key = user_data.get("gemini_api_key") or user_data.get("geminiApiKey")
                    resolved_gemini = _sanitize_api_key(gem_key)

                # Fallback for OpenRouter key if not provided via header
                if not resolved_openrouter:
                    open_key = user_data.get("openrouter_api_key") or user_data.get("openrouterApiKey")
                    resolved_openrouter = _sanitize_api_key(open_key)

                # Fallback for custom model chain if x_ai_models header wasn't provided
                if custom_chain is None and "models" in user_data and isinstance(user_data["models"], list):
                    chain: List[Tuple[str, str]] = []
                    for item in user_data["models"]:
                        if isinstance(item, dict) and "provider" in item and "id" in item:
                            enabled = item.get("enabled", True)
                            if enabled is False or str(enabled).lower() in ("false", "0"):
                                continue
                            prov = str(item["provider"]).strip().lower()
                            mod_id = str(item["id"]).strip()
                            if not prov or not mod_id:
                                continue
                            if prov == "openrouter":
                                if mod_id in ("openrouter-free", "openrouter-auto"):
                                    mod_id = "openrouter/auto"
                                elif mod_id == "qwen-2.5-vl-72b":
                                    mod_id = "qwen/qwen2.5-vl-72b-instruct:free"
                            chain.append((prov, mod_id))
                    custom_chain = chain
        except Exception as e:
            logger.debug(f"Could not parse user ai_settings_json: {e}")

    return resolved_gemini, resolved_openrouter, custom_chain


@router.post("/recognize", response_model=FoodRecognitionResponse)
async def recognize_food_endpoint(
    photo: UploadFile = File(..., description="Фотография еды (JPEG, PNG, WebP)"),
    comment: Optional[str] = Form(None, description="Пояснение пользователя к фото (опционально)"),
    user_comment: Optional[str] = Form(None, description="Пояснение пользователя к фото (алиас)"),
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
):
    """
    Recognize food and estimate KBJU from an uploaded photo using AI.
    - Validates image MIME type and file size (max 10MB)
    - Compresses and stores the image in uploads directory
    - Processes with multi-provider AI fallback chain (Gemini & OpenRouter)
    - Cleans up uploaded file if AI analysis fails
    - Rate limited to configured requests per minute per user
    """
    # 1. Check rate limit
    check_ai_rate_limit(current_user.id)

    resolved_comment = (user_comment or comment or "").strip() or None

    # 2. Save uploaded file to disk and get web URL path
    dest_path, relative_url_path = await save_uploaded_file(photo)

    try:
        # 3. Read compressed image bytes for AI provider
        with open(dest_path, "rb") as f:
            image_bytes = f.read()

        # 4. Resolve AI configuration (headers take precedence over user saved settings)
        custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
            current_user=current_user,
            x_gemini_key=x_gemini_key,
            x_openrouter_key=x_openrouter_key,
            x_ai_models=x_ai_models,
        )

        # 5. Invoke AI Router
        result, provider_name, model_id = await ai_router.recognize_food(
            image_bytes=image_bytes,
            mime_type="image/jpeg",
            user_comment=resolved_comment,
            custom_gemini_key=custom_gemini,
            custom_openrouter_key=custom_openrouter,
            custom_model_chain=custom_chain,
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

    except HTTPException:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        raise
    except AllProvidersFailedError as e:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обработке запроса AI: {str(e)}",
        )


@router.post("/analyze-text", response_model=FoodRecognitionResponse)
async def analyze_food_text_endpoint(
    request: TextAnalysisRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_ai_models: Optional[str] = Header(None, alias="X-AI-Models"),
    current_user: User = Depends(get_current_user),
):
    """
    Recognize food and estimate KBJU from a text description using AI.
    - Parses text, determines dish, ingredients, and KBJU
    - Processes with multi-provider AI fallback chain (Gemini & OpenRouter)
    - Rate limited to configured requests per minute per user
    """
    # 1. Check rate limit
    check_ai_rate_limit(current_user.id)

    # 2. Resolve AI configuration (headers take precedence over user saved settings)
    custom_gemini, custom_openrouter, custom_chain = resolve_ai_config(
        current_user=current_user,
        x_gemini_key=x_gemini_key,
        x_openrouter_key=x_openrouter_key,
        x_ai_models=x_ai_models,
    )

    # 3. Invoke AI Router for text
    try:
        result, provider_name, model_id = await ai_router.recognize_food_by_text(
            text=request.text,
            custom_gemini_key=custom_gemini,
            custom_openrouter_key=custom_openrouter,
            custom_model_chain=custom_chain,
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
        photo_path=None,
        provider_used=provider_name,
        model_used=model_id,
        raw_response=None,
    )
