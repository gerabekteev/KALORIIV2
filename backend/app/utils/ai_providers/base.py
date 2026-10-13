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
        "6. Углеводы (г)\n"
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


def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract valid JSON from LLM response text, stripping markdown code fences if present."""
    text = text.strip()

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


def parse_food_result(raw_json: Dict[str, Any]) -> FoodAnalysisResult:
    """Validate and normalize raw JSON into FoodAnalysisResult."""
    confidence = str(raw_json.get("confidence", "medium")).lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"

    return FoodAnalysisResult(
        name=str(raw_json.get("name", "Блюдо")).strip(),
        weight_grams=max(0.0, float(raw_json.get("weight_grams", 100.0))),
        calories=max(0.0, float(raw_json.get("calories", 0.0))),
        protein=max(0.0, float(raw_json.get("protein", 0.0))),
        fat=max(0.0, float(raw_json.get("fat", 0.0))),
        carbs=max(0.0, float(raw_json.get("carbs", 0.0))),
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
