import asyncio
import logging
from typing import Optional, List, Tuple
from app.config import settings
from app.schemas.ai import FoodAnalysisResult
from app.utils.ai_providers import (
    BaseAIProvider,
    GeminiProvider,
    OpenRouterProvider,
    AIProviderError,
    AIAuthenticationError,
)

logger = logging.getLogger("kalorii.ai_router")

# Default priority model chain defined in AI-MODELS-CATALOG.md
DEFAULT_MODEL_CHAIN: List[Tuple[str, str]] = [
    ("gemini", "gemini-3.8-flash"),
    ("gemini", "gemini-3-flash-preview"),
    ("openrouter", "qwen/qwen2.5-vl-72b-instruct:free"),
    ("gemini", "gemini-2.5-flash"),
    ("gemini", "gemini-3.5-flash-lite"),
    ("openrouter", "openrouter/free"),
    ("gemini", "gemini-2.0-flash"),
]


class AllProvidersFailedError(Exception):
    """Raised when all configured AI models and providers fail."""
    pass


class AIRouter:
    """
    Multi-provider AI vision router with automatic fallback and retry mechanism.
    Tries each configured model up to 2 times with a 5-second cooldown on failure
    before falling back to the next model in the priority chain.
    """

    def __init__(
        self,
        gemini_api_key: Optional[str] = None,
        openrouter_api_key: Optional[str] = None,
        model_chain: Optional[List[Tuple[str, str]]] = None,
    ):
        self.gemini_api_key = gemini_api_key or settings.GEMINI_API_KEY
        self.openrouter_api_key = openrouter_api_key or settings.OPENROUTER_API_KEY
        self.model_chain = model_chain or DEFAULT_MODEL_CHAIN

    def _get_provider_instance(self, provider_type: str, model_id: str) -> Optional[BaseAIProvider]:
        """Instantiate appropriate provider adapter if API key is configured."""
        if provider_type == "gemini":
            if not self.gemini_api_key:
                logger.debug(f"Gemini API key is not configured; skipping {model_id}")
                return None
            return GeminiProvider(api_key=self.gemini_api_key, model_id=model_id)

        elif provider_type == "openrouter":
            if not self.openrouter_api_key:
                logger.debug(f"OpenRouter API key is not configured; skipping {model_id}")
                return None
            return OpenRouterProvider(api_key=self.openrouter_api_key, model_id=model_id)

        return None

    async def recognize_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
    ) -> Tuple[FoodAnalysisResult, str, str]:
        """
        Execute food recognition across the fallback priority chain.
        Returns (result, provider_name, model_id).
        Raises AllProvidersFailedError if all models exhaust retries.
        """
        errors_collected: List[str] = []

        for provider_type, model_id in self.model_chain:
            provider = self._get_provider_instance(provider_type, model_id)
            if not provider:
                continue

            logger.info(f"Attempting food recognition using {provider_type} / {model_id}...")

            for attempt in range(1, 3):  # 2 attempts per model
                try:
                    result = await provider.analyze_food(
                        image_bytes=image_bytes,
                        mime_type=mime_type,
                        user_comment=user_comment,
                    )
                    logger.info(
                        f"Successfully recognized food using {provider_type}/{model_id} (attempt {attempt}): {result.name}"
                    )
                    return result, provider_type, model_id

                except AIAuthenticationError as auth_err:
                    logger.warning(
                        f"Authentication failure for {provider_type}/{model_id}: {auth_err}. Skipping retries for this provider."
                    )
                    errors_collected.append(f"{provider_type}/{model_id}: {auth_err}")
                    break  # Skip 2nd attempt if auth failed

                except AIProviderError as err:
                    logger.warning(
                        f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}"
                    )
                    errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")

                    if attempt == 1:
                        # Wait 5 seconds before retrying the same model
                        logger.info(f"Waiting 5 seconds before retry for {provider_type}/{model_id}...")
                        await asyncio.sleep(5)

                except Exception as ex:
                    logger.error(
                        f"Unexpected error in {provider_type}/{model_id} (attempt {attempt}): {ex}",
                        exc_info=True,
                    )
                    errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {ex}")
                    if attempt == 1:
                        await asyncio.sleep(5)

        logger.error(f"All AI vision models failed. Errors summary: {errors_collected}")
        raise AllProvidersFailedError(
            "Все модели AI в данный момент недоступны. Пожалуйста, введите данные о блюде вручную."
        )


# Global default instance
ai_router = AIRouter()
