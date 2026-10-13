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
    AIRateLimitError,
    AIAuthenticationError,
)

logger = logging.getLogger("kalorii.ai_router")

# Default priority model chain defined in AI-MODELS-CATALOG.md
DEFAULT_MODEL_CHAIN: List[Tuple[str, str]] = [
    ("gemini", "gemini-3.1-flash-lite"),
    ("gemini", "gemini-3.5-flash"),
    ("gemini", "gemini-3.6-flash"),
    ("gemini", "gemini-3.8-flash"),
    ("gemini", "gemini-3.7-flash"),
    ("gemini", "gemini-3.5-flash-lite"),
    ("openrouter", "google/gemma-4-26b-a4b-it:free"),
    ("openrouter", "google/gemma-4-31b-it:free"),
    ("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
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

    def _get_provider_instance(
        self,
        provider_type: str,
        model_id: str,
        gemini_key: Optional[str] = None,
        openrouter_key: Optional[str] = None,
    ) -> Optional[BaseAIProvider]:
        """Instantiate appropriate provider adapter if API key is configured."""
        if provider_type == "gemini":
            key = gemini_key or self.gemini_api_key
            if not key:
                logger.debug(f"Gemini API key is not configured; skipping {model_id}")
                return None
            return GeminiProvider(api_key=key, model_id=model_id)

        elif provider_type == "openrouter":
            key = openrouter_key or self.openrouter_api_key
            if not key:
                logger.debug(f"OpenRouter API key is not configured; skipping {model_id}")
                return None
            return OpenRouterProvider(api_key=key, model_id=model_id)

        return None

    async def recognize_food(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        user_comment: Optional[str] = None,
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[FoodAnalysisResult, str, str]:
        """
        Execute food recognition across the fallback priority chain.
        Returns (result, provider_name, model_id).
        Raises AllProvidersFailedError if all models exhaust retries.
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain else self.model_chain

        for provider_type, model_id in chain_to_use:
            provider = self._get_provider_instance(
                provider_type,
                model_id,
                gemini_key=custom_gemini_key,
                openrouter_key=custom_openrouter_key,
            )
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

                except AIRateLimitError as rate_err:
                    logger.warning(
                        f"Rate limit for {provider_type}/{model_id}: {rate_err}. Falling back immediately to next model in chain."
                    )
                    errors_collected.append(f"{provider_type}/{model_id}: {rate_err}")
                    break  # Skip 2nd attempt, fallback immediately

                except AIProviderError as err:
                    logger.warning(
                        f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}"
                    )
                    errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")

                    err_str = str(err).lower()
                    if any(term in err_str for term in ["high demand", "503", "unavailable", "заблокирован", "not supported", "no longer available", "resource_exhausted"]):
                        logger.info(f"Instant failover triggered for {model_id}: {err}. Moving directly to next model in chain.")
                        break

                    if attempt == 1:
                        # Wait 2 seconds before retrying the same model for network glitches
                        logger.info(f"Waiting 2 seconds before retry for {provider_type}/{model_id}...")
                        await asyncio.sleep(2)

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
