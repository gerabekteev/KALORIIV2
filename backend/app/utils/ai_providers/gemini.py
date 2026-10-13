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
    build_text_prompt,
    extract_json_from_text,
    parse_food_result,
)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseAIProvider):
    """Google Gemini vision and text API provider using direct HTTP requests."""

    def __init__(self, api_key: str, model_id: str = "gemini-3.8-flash"):
        super().__init__(api_key=api_key, model_id=model_id, provider_name="gemini")

    async def _send_and_parse(self, payload: dict) -> FoodAnalysisResult:
        from app.config import settings

        base_url = (settings.GEMINI_BASE_URL or GEMINI_BASE_URL).rstrip("/")
        url = f"{base_url}/{self.model_id}:generateContent?key={self.api_key}"
        proxy = settings.GEMINI_PROXY_URL.strip() if settings.GEMINI_PROXY_URL else None

        client_kwargs = {"timeout": 45.0}
        if proxy:
            client_kwargs["proxy"] = proxy

        async with httpx.AsyncClient(**client_kwargs) as client:
            try:
                response = await client.post(url, json=payload)
            except httpx.TimeoutException:
                raise AIProviderError(f"Gemini ({self.model_id}) timeout exceeded")
            except httpx.RequestError as e:
                raise AIProviderError(f"Gemini ({self.model_id}) network error: {e}")

        # Check for Google Geo-blocking
        if "User location is not supported" in response.text:
            raise AIProviderError(
                f"Gemini ({self.model_id}) заблокирован Google по геолокации сервера. "
                "Используйте GEMINI_PROXY_URL / GEMINI_BASE_URL в .env или fallback на OpenRouter."
            )

        # Check status codes
        if response.status_code == 429 or "RESOURCE_EXHAUSTED" in response.text or "quota" in response.text.lower():
            raise AIRateLimitError(f"Gemini ({self.model_id}) rate limit exceeded: {response.text[:200]}")
        elif response.status_code in {401, 403}:
            raise AIAuthenticationError(f"Gemini API key is invalid or unauthorized ({response.status_code})")
        elif response.status_code != 200:
            # Fallback if responseMimeType wasn't supported: retry without responseMimeType
            error_text = response.text
            if "responseMimeType" in error_text:
                payload_retry = dict(payload)
                if "generationConfig" in payload_retry:
                    payload_retry["generationConfig"] = dict(payload_retry["generationConfig"])
                    payload_retry["generationConfig"].pop("responseMimeType", None)
                async with httpx.AsyncClient(**client_kwargs) as client:
                    response = await client.post(url, json=payload_retry)
                if "User location is not supported" in response.text:
                    raise AIProviderError(
                        f"Gemini ({self.model_id}) заблокирован Google по геолокации сервера. "
                        "Используйте GEMINI_PROXY_URL / GEMINI_BASE_URL в .env или fallback на OpenRouter."
                    )
                if response.status_code == 429 or "RESOURCE_EXHAUSTED" in response.text or "quota" in response.text.lower():
                    raise AIRateLimitError(f"Gemini ({self.model_id}) rate limit exceeded: {response.text[:200]}")
                elif response.status_code != 200:
                    raise AIProviderError(f"Gemini ({self.model_id}) error {response.status_code}: {response.text[:200]}")
            else:
                raise AIProviderError(f"Gemini ({self.model_id}) error {response.status_code}: {response.text[:200]}")

        data = response.json()
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                prompt_feedback = data.get("promptFeedback", {})
                block_reason = prompt_feedback.get("blockReason")
                if block_reason:
                    raise AIProviderError(f"Gemini ({self.model_id}) prompt blocked: {block_reason}")
                raise AIProviderError(f"Gemini ({self.model_id}) returned no candidates")

            first_candidate = candidates[0]
            finish_reason = first_candidate.get("finishReason")
            if finish_reason in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"}:
                raise AIProviderError(f"Gemini ({self.model_id}) response blocked due to {finish_reason}")

            content_parts = first_candidate.get("content", {}).get("parts", [])
            if not content_parts:
                raise AIProviderError(f"Gemini ({self.model_id}) returned empty parts")

            # Ignore parts with thought: True or thinking: True
            non_thought_parts = [
                part for part in content_parts
                if not (part.get("thought") is True or part.get("thinking") is True)
            ]

            target_parts = non_thought_parts if non_thought_parts else content_parts

            # Try parsing JSON from individual non-thought parts first
            parsed_json = None
            for part in target_parts:
                part_text = part.get("text", "").strip()
                if not part_text:
                    continue
                try:
                    parsed_json = extract_json_from_text(part_text)
                    if parsed_json and isinstance(parsed_json, dict):
                        break
                except Exception:
                    continue

            # If not found in individual parts, combine all non-thought text parts
            if not parsed_json:
                combined_text = "".join(
                    part.get("text", "") for part in target_parts if part.get("text")
                ).strip()
                if not combined_text:
                    raise AIProviderError(f"Gemini ({self.model_id}) returned no text in response parts")
                parsed_json = extract_json_from_text(combined_text)

            return parse_food_result(parsed_json)
        except AIProviderError:
            raise
        except Exception as e:
            raise AIProviderError(f"Failed to parse Gemini response: {e}")

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

        return await self._send_and_parse(payload)

    async def analyze_food_text(
        self,
        text: str,
    ) -> FoodAnalysisResult:
        if not self.api_key:
            raise AIAuthenticationError("Gemini API key is not configured")

        prompt = build_text_prompt(text)
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        return await self._send_and_parse(payload)
