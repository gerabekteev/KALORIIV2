import base64
import json
import re
from typing import Optional, Dict, Any
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


def _extract_openrouter_error(resp_text: str) -> str:
    """Safely extract error message from OpenRouter JSON response or raw string."""
    try:
        err_json = json.loads(resp_text)
        if isinstance(err_json, dict) and "error" in err_json:
            err_data = err_json["error"]
            if isinstance(err_data, dict):
                return (
                    err_data.get("message")
                    or err_data.get("metadata", {}).get("raw")
                    or str(err_data)
                )
            return str(err_data)
    except Exception:
        pass
    return resp_text[:200]


class OpenRouterProvider(BaseAIProvider):
    """OpenRouter provider for OpenAI-compatible multi-modal endpoints."""

    def __init__(
        self,
        api_key: str,
        model_id: str = "google/gemma-4-26b-a4b-it:free",
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

        payload: Dict[str, Any] = {
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

        # Fallback if model rejects response_format (common on free OpenRouter models)
        if response.status_code != 200 and "response_format" in payload:
            err_text_low = response.text.lower()
            if any(term in err_text_low for term in ["response_format", "json_object", "schema", "format", "unsupported"]):
                payload.pop("response_format", None)
                async with httpx.AsyncClient(timeout=60.0) as client:
                    try:
                        response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                    except httpx.TimeoutException:
                        raise AIProviderError(f"OpenRouter ({self.model_id}) timeout exceeded on retry")
                    except httpx.RequestError as e:
                        raise AIProviderError(f"OpenRouter ({self.model_id}) network error on retry: {e}")

        # Check status codes
        if response.status_code == 429:
            err_msg = _extract_openrouter_error(response.text)
            raise AIRateLimitError(f"OpenRouter ({self.model_id}) rate limit exceeded (429): {err_msg}")
        elif response.status_code in {401, 403}:
            err_msg = _extract_openrouter_error(response.text)
            raise AIAuthenticationError(f"OpenRouter API key is invalid or unauthorized ({response.status_code}): {err_msg}")
        elif response.status_code != 200:
            err_msg = _extract_openrouter_error(response.text)
            low_msg = err_msg.lower()
            if any(term in low_msg for term in ["rate limit", "quota", "credits", "too many requests", "exceeded", "limit reached"]):
                raise AIRateLimitError(f"OpenRouter ({self.model_id}) rate limited: {err_msg}")
            raise AIProviderError(f"OpenRouter ({self.model_id}) error {response.status_code}: {err_msg}")

        try:
            data = response.json()
        except Exception:
            raise AIProviderError(f"OpenRouter ({self.model_id}) returned invalid JSON: {response.text[:200]}")

        # Some upstream providers return 200 with an error object
        if "error" in data:
            err_msg = _extract_openrouter_error(response.text)
            low_msg = err_msg.lower()
            if any(term in low_msg for term in ["rate limit", "quota", "credits", "too many requests", "exceeded", "limit reached"]):
                raise AIRateLimitError(f"OpenRouter ({self.model_id}) rate limited: {err_msg}")
            raise AIProviderError(f"OpenRouter ({self.model_id}) error in payload: {err_msg}")

        try:
            choices = data.get("choices", [])
            if not choices:
                raise AIProviderError(f"OpenRouter ({self.model_id}) returned no choices")

            message = choices[0].get("message", {})
            text_output = message.get("content") or ""
            if not text_output.strip():
                finish_reason = choices[0].get("finish_reason", "unknown")
                raise AIProviderError(
                    f"OpenRouter ({self.model_id}) returned empty content (finish_reason: {finish_reason})"
                )

            # Strip any reasoning or think tags
            cleaned_text = re.sub(
                r"<(?:thought|thinking|think)>[\s\S]*?</(?:thought|thinking|think)>",
                "",
                text_output,
                flags=re.IGNORECASE,
            ).strip()

            parsed_json = extract_json_from_text(cleaned_text or text_output)
            return parse_food_result(parsed_json)
        except AIProviderError:
            raise
        except Exception as e:
            raise AIProviderError(f"Failed to parse OpenRouter response: {e}")
