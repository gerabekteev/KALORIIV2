import abc
import json
import re
from typing import Optional, Dict, Any
from app.schemas.ai import FoodAnalysisResult


class AIProviderError(Exception):
    """Base exception for AI provider failures."""
    pass


class AIRateLimitError(AIProviderError):
    """Raised when an AI provider returns HTTP 429 or quota exceeded."""
    pass


class AIAuthenticationError(AIProviderError):
    """Raised when API key is missing or invalid."""
    pass


def build_system_prompt(user_comment: Optional[str] = None) -> str:
    """Build standardized food recognition prompt according to KaloriiAI specifications."""
    comment_clause = f"\nПояснение пользователя: {user_comment.strip()}" if user_comment and user_comment.strip() else ""

    return (
        "Ты — эксперт-нутрициолог. Проанализируй фото еды и определи:\n"
        "1. Название блюда/продукта\n"
        "2. Примерный вес порции в граммах\n"
        "3. Калории (ккал)\n"
        "4. Белки (г)\n"
        "5. Жиры (г)\n"
        "6. Углеводы (г)\n\n"
        "ВАЖНО (Распознавание скриншотов и OCR):\n"
        "Если на изображении представлен скриншот экрана (приложение доставки еды — Яндекс Еда, Самокат, Додо и т.д., таблица пищевой ценности КБЖУ, этикетка продукта, чек, меню или скриншот рецепта) — распознай напечатанный текст, найди точные указанные значения веса в граммах, калорий, белков, жиров и углеводов и верни их в JSON!"
        f"{comment_clause}\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "name": "название",\n'
        '  "weight_grams": число,\n'
        '  "calories": число,\n'
        '  "protein": число,\n'
        '  "fat": число,\n'
        '  "carbs": число,\n'
        '  "confidence": "high/medium/low"\n'
        "}"
    )


def build_text_prompt(text: str) -> str:
    """Build standardized food recognition prompt for text input according to KaloriiAI specifications."""
    return (
        "Ты — эксперт-нутрициолог. Пользователь описал свой приём пищи:\n"
        f'"{text.strip()}"\n\n'
        "Определи:\n"
        "1. Название блюда/продукта\n"
        "2. Примерный вес порции в граммах (если вес или количество указаны в тексте, используй их; иначе оцени реалистичный стандартный вес порции)\n"
        "3. Калории (ккал)\n"
        "4. Белки (г)\n"
        "5. Жиры (г)\n"
        "6. Углеводы (г)\n\n"
        "Ответь СТРОГО в JSON формате:\n"
        "{\n"
        '  "name": "название",\n'
        '  "weight_grams": число,\n'
        '  "calories": число,\n'
        '  "protein": число,\n'
        '  "fat": число,\n'
        '  "carbs": число,\n'
        '  "confidence": "high/medium/low"\n'
        "}"
    )


def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract valid JSON from LLM response text, stripping markdown code fences and thought blocks if present."""
    text = text.strip()

    # Strip reasoning / thought tags if present
    text = re.sub(r"<(?:thought|thinking|think)>[\s\S]*?</(?:thought|thinking|think)>", "", text, flags=re.IGNORECASE).strip()

    # Look for ```json ... ``` or ``` ... ```
    code_block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if code_block_match:
        text = code_block_match.group(1).strip()

    # If starts with { and ends with }, parse directly
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: find first { and last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_substr = text[start : end + 1]
            return json.loads(json_substr)
        raise AIProviderError(f"Не удалось распарсить JSON из ответа нейросети: {text[:200]}")


def _parse_float_safely(val: Any, default: float = 0.0) -> float:
    """Safely extract float from numbers or strings with units like '300g' or '~250'."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip().replace(",", ".")
    match = re.search(r"[-+]?\d*\.?\d+", val_str)
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            pass
    return default


def parse_food_result(raw_json: Dict[str, Any]) -> FoodAnalysisResult:
    """Validate and normalize raw JSON into FoodAnalysisResult."""
    confidence = str(raw_json.get("confidence", "medium")).lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"

    return FoodAnalysisResult(
        name=str(raw_json.get("name", "Блюдо")).strip(),
        weight_grams=max(0.0, _parse_float_safely(raw_json.get("weight_grams"), 100.0)),
        calories=max(0.0, _parse_float_safely(raw_json.get("calories"), 0.0)),
        protein=max(0.0, _parse_float_safely(raw_json.get("protein"), 0.0)),
        fat=max(0.0, _parse_float_safely(raw_json.get("fat"), 0.0)),
        carbs=max(0.0, _parse_float_safely(raw_json.get("carbs"), 0.0)),
        confidence=confidence,  # type: ignore[arg-type]
    )


class BaseAIProvider(abc.ABC):
    """Abstract interface for multi-modal AI vision providers."""

    def __init__(self, api_key: str, model_id: str, provider_name: str):
        self.api_key = api_key
        self.model_id = model_id
        self.provider_name = provider_name

    @abc.abstractmethod
    async def analyze_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
    ) -> FoodAnalysisResult:
        """Send image and prompt to provider API and return structured food analysis."""
        pass

    @abc.abstractmethod
    async def analyze_food_text(
        self,
        text: str,
    ) -> FoodAnalysisResult:
        """Send text description of food to provider API and return structured food analysis."""
        pass
