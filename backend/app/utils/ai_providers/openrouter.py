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

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider(BaseAIProvider):
    """OpenRouter provider for OpenAI-compatible multi-modal endpoints."""

    def __init__(
        self,
        api_key: str,
        model_id: str = "qwen/qwen2.5-vl-72b-instruct:free",
    ):
        super().__init__(api_key=api_key, model_id=model_id, provider_name="openrouter")

    async def analyze_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
    ) -> FoodAnalysisResult:
        if not self.api_key:
            raise AIAuthenticationError("OpenRouter API key is not configured")

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:{mime_type};base64,{b64_image}"
        prompt = build_system_prompt(user_comment)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://kalorii.lopni.fun",
            "X-Title": "KaloriiAI",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_uri},
                        },
                    ],
                }
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            except httpx.TimeoutException:
                raise AIProviderError(f"OpenRouter ({self.model_id}) timeout exceeded")
            except httpx.RequestError as e:
                raise AIProviderError(f"OpenRouter ({self.model_id}) network error: {e}")

        if response.status_code == 429:
            raise AIRateLimitError(f"OpenRouter ({self.model_id}) rate limit exceeded (429)")
        elif response.status_code in {401, 403}:
            raise AIAuthenticationError(f"OpenRouter API key is invalid ({response.status_code})")
        elif response.status_code != 200:
            # Some free models might reject response_format; retry without response_format
            if "response_format" in response.text:
                payload.pop("response_format", None)
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                if response.status_code != 200:
                    raise AIProviderError(
                        f"OpenRouter ({self.model_id}) error {response.status_code}: {response.text[:200]}"
                    )
            else:
                raise AIProviderError(
                    f"OpenRouter ({self.model_id}) error {response.status_code}: {response.text[:200]}"
                )

        data = response.json()
        try:
            choices = data.get("choices", [])
            if not choices:
                raise AIProviderError(f"OpenRouter ({self.model_id}) returned no choices")

            text_output = choices[0].get("message", {}).get("content", "")
            parsed_json = extract_json_from_text(text_output)
            return parse_food_result(parsed_json)
        except AIProviderError:
            raise
        except Exception as e:
            raise AIProviderError(f"Failed to parse OpenRouter response: {e}")
