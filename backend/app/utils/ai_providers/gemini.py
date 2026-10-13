import base64
from typing import Optional
import httpx

from app.schemas.ai import FoodAnalysisResult
from app.utils.ai_providers.base import (
    BaseAIProvider,
    AIProviderError,
    AIRateLimitError,
    AIAuthenticationError,
    build_system_prompt,
    extract_json_from_text,
    parse_food_result,
)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseAIProvider):
    """Google Gemini vision API provider using direct HTTP requests."""

    def __init__(self, api_key: str, model_id: str = "gemini-3.8-flash"):
        super().__init__(api_key=api_key, model_id=model_id, provider_name="gemini")

    async def analyze_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
    ) -> FoodAnalysisResult:
        if not self.api_key:
            raise AIAuthenticationError("Gemini API key is not configured")

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        prompt = build_system_prompt(user_comment)

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        url = f"{GEMINI_BASE_URL}/{self.model_id}:generateContent?key={self.api_key}"

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                response = await client.post(url, json=payload)
            except httpx.TimeoutException:
                raise AIProviderError(f"Gemini ({self.model_id}) timeout exceeded")
            except httpx.RequestError as e:
                raise AIProviderError(f"Gemini ({self.model_id}) network error: {e}")

        # Check status codes
        if response.status_code == 429:
            raise AIRateLimitError(f"Gemini ({self.model_id}) rate limit exceeded (429)")
        elif response.status_code in {401, 403}:
            raise AIAuthenticationError(f"Gemini API key is invalid or unauthorized ({response.status_code})")
        elif response.status_code != 200:
            # Fallback if responseMimeType wasn't supported: retry without responseMimeType
            error_text = response.text
            if "responseMimeType" in error_text:
                payload["generationConfig"].pop("responseMimeType", None)
                async with httpx.AsyncClient(timeout=45.0) as client:
                    response = await client.post(url, json=payload)
                if response.status_code != 200:
                    raise AIProviderError(f"Gemini ({self.model_id}) error {response.status_code}: {response.text[:200]}")
            else:
                raise AIProviderError(f"Gemini ({self.model_id}) error {response.status_code}: {response.text[:200]}")

        data = response.json()
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                raise AIProviderError(f"Gemini ({self.model_id}) returned no candidates")

            content_parts = candidates[0].get("content", {}).get("parts", [])
            if not content_parts:
                raise AIProviderError(f"Gemini ({self.model_id}) returned empty parts")

            text_output = content_parts[0].get("text", "")
            parsed_json = extract_json_from_text(text_output)
            return parse_food_result(parsed_json)
        except AIProviderError:
            raise
        except Exception as e:
            raise AIProviderError(f"Failed to parse Gemini response: {e}")
