import asyncio
import logging
from typing import Optional, List, Tuple
from app.config import settings
from app.schemas.ai import FoodAnalysisResult, PlannedMealItem
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
    ("openrouter", "openrouter/auto"),
    ("openrouter", "google/gemma-4-26b-a4b-it:free"),
    ("openrouter", "google/gemma-4-31b-it:free"),
    ("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
    ("gemini", "gemini-3.7-flash"),
    ("gemini", "gemini-3.5-flash-lite"),
]

MODEL_METADATA_CATALOG: dict[str, Tuple[str, str]] = {
    "gemini-3.1-flash-lite": ("Gemini 3.1 Flash-Lite (500 RPD)", "Лимит 500 запросов/день, 15 RPM. Быстрый и надёжный"),
    "gemini-3.5-flash": ("Gemini 3.5 Flash", "Высокая точность и детализация блюд"),
    "gemini-3.6-flash": ("Gemini 3.6 Flash", "Стабильная мультимодальная модель"),
    "gemini-3.8-flash": ("Gemini 3.8 Flash", "Максимальный reasoning и точность (20 RPD)"),
    "openrouter/auto": ("OpenRouter Auto", "Умный авто-выбор лучшей доступной модели"),
    "google/gemma-4-26b-a4b-it:free": ("Gemma 4 26B (Free)", "Мощная визуальная модель от Google"),
    "google/gemma-4-31b-it:free": ("Gemma 4 31B (Free)", "Продвинутая мультимодальная модель Google"),
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": ("NVIDIA Omni (Free)", "Reasoning VLM от NVIDIA с поддержкой vision"),
    "gemini-3.7-flash": ("Gemini 3.7 Flash", "Сбалансированный анализ и высокая скорость (20 RPD)"),
    "gemini-3.5-flash-lite": ("Gemini 3.5 Flash-Lite", "Экономичный и ультрабыстрый отклик"),
    "nvidia/nemotron-3.5-super-vl:free": ("NVIDIA Nemotron Super-VL (Free)", "Сверхбыстрая Vision VLM модель от NVIDIA"),
}


def get_default_model_items() -> List[dict]:
    """Return default list of AI models formatted as dictionary items."""
    items = []
    for provider, model_id in DEFAULT_MODEL_CHAIN:
        meta = MODEL_METADATA_CATALOG.get(model_id)
        name = meta[0] if meta else model_id
        desc = meta[1] if meta else None
        items.append({
            "id": model_id,
            "name": name,
            "provider": provider,
            "description": desc,
            "enabled": True,
        })
    return items



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
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        try:
            async with asyncio.timeout(55.0):
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
                            async with asyncio.timeout(20.0):
                                result = await provider.analyze_food(
                                    image_bytes=image_bytes,
                                    mime_type=mime_type,
                                    user_comment=user_comment,
                                )
                            logger.info(
                                f"Successfully recognized food using {provider_type}/{model_id} (attempt {attempt}): {result.name}"
                            )
                            return result, provider_type, model_id

                        except (asyncio.TimeoutError, TimeoutError):
                            logger.warning(
                                f"Timeout (20s) for {provider_type}/{model_id} (attempt {attempt}). Moving to next attempt/provider."
                            )
                            errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): timeout >20s")
                            break

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

        except (asyncio.TimeoutError, TimeoutError):
            logger.error(f"Overall AI cascade timeout exceeded (55.0s). Errors: {errors_collected}")
            raise AllProvidersFailedError(
                "Превышено общее время ожидания распознавания блюда (55 сек). Пожалуйста, введите данные вручную или повторите попытку."
            )

        logger.error(f"All AI vision models failed. Errors summary: {errors_collected}")
        raise AllProvidersFailedError(
            "Все модели AI в данный момент недоступны. Пожалуйста, введите данные о блюде вручную."
        )

    async def recognize_food_by_text(
        self,
        text: str,
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[FoodAnalysisResult, str, str]:
        """
        Execute food recognition from text description across the fallback priority chain.
        Returns (result, provider_name, model_id).
        Raises AllProvidersFailedError if all models exhaust retries.
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        try:
            async with asyncio.timeout(55.0):
                for provider_type, model_id in chain_to_use:
                    provider = self._get_provider_instance(
                        provider_type,
                        model_id,
                        gemini_key=custom_gemini_key,
                        openrouter_key=custom_openrouter_key,
                    )
                    if not provider:
                        continue

                    logger.info(f"Attempting food text recognition using {provider_type} / {model_id}...")

                    for attempt in range(1, 3):  # 2 attempts per model
                        try:
                            async with asyncio.timeout(20.0):
                                result = await provider.analyze_food_text(text=text)
                            logger.info(
                                f"Successfully recognized food from text using {provider_type}/{model_id} (attempt {attempt}): {result.name}"
                            )
                            return result, provider_type, model_id

                        except (asyncio.TimeoutError, TimeoutError):
                            logger.warning(
                                f"Timeout (20s) for {provider_type}/{model_id} (attempt {attempt}). Moving to next attempt/provider."
                            )
                            errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): timeout >20s")
                            break

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

        except (asyncio.TimeoutError, TimeoutError):
            logger.error(f"Overall AI cascade timeout exceeded for text (55.0s). Errors: {errors_collected}")
            raise AllProvidersFailedError(
                "Превышено общее время ожидания распознавания текста (55 сек). Пожалуйста, введите данные вручную или повторите попытку."
            )

        logger.error(f"All AI models failed for text recognition. Errors summary: {errors_collected}")
        raise AllProvidersFailedError(
            "Все модели AI в данный момент недоступны. Пожалуйста, введите данные о блюде вручную."
        )

    async def recognize_food_by_voice(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/ogg",
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[FoodAnalysisResult, str, str]:
        """
        Execute voice food recognition & transcription across the user's priority model chain.
        Returns (result, provider_name, model_id).
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        try:
            async with asyncio.timeout(55.0):
                for provider_type, model_id in chain_to_use:
                    provider = self._get_provider_instance(
                        provider_type,
                        model_id,
                        gemini_key=custom_gemini_key,
                        openrouter_key=custom_openrouter_key,
                    )
                    if not provider:
                        continue

                    logger.info(f"Attempting voice food recognition using {provider_type} / {model_id}...")

                    for attempt in range(1, 3):
                        try:
                            async with asyncio.timeout(20.0):
                                result = await provider.analyze_food_voice(
                                    audio_bytes=audio_bytes,
                                    mime_type=mime_type,
                                )
                            logger.info(
                                f"Successfully recognized voice food using {provider_type}/{model_id} (attempt {attempt}): {result.name}"
                            )
                            return result, provider_type, model_id
                        except (asyncio.TimeoutError, TimeoutError):
                            logger.warning(f"Timeout (20s) on voice {provider_type}/{model_id} (attempt {attempt}).")
                            errors_collected.append(f"{provider_type}/{model_id}: timeout")
                            break
                        except (AIAuthenticationError, AIRateLimitError) as err:
                            logger.warning(f"Failover on {provider_type}/{model_id}: {err}")
                            errors_collected.append(f"{provider_type}/{model_id}: {err}")
                            break
                        except AIProviderError as err:
                            logger.warning(f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}")
                            errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")
                            err_str = str(err).lower()
                            if any(term in err_str for term in ["high demand", "503", "unavailable", "заблокирован", "not supported", "audio", "modality", "resource_exhausted"]):
                                break
                            if attempt == 1:
                                await asyncio.sleep(2)
                        except Exception as ex:
                            logger.error(f"Unexpected error in {provider_type}/{model_id}: {ex}", exc_info=True)
                            errors_collected.append(f"{provider_type}/{model_id}: {ex}")
                            break

        except (asyncio.TimeoutError, TimeoutError):
            logger.error(f"Overall AI cascade timeout exceeded for voice (55.0s). Errors: {errors_collected}")
            raise AllProvidersFailedError(
                "Превышено время ожидания ответа AI при распознавании голоса (55 сек). Попробуйте описать текстом."
            )

        logger.error(f"All AI models failed for voice recognition: {errors_collected}")
        raise AllProvidersFailedError(
            "Не удалось распознать голосовое сообщение через AI. Попробуйте описать блюдо текстом."
        )

    async def generate_meal_plan(
        self,
        prompt: str,
        expected_count: int,
        max_calories: float,
        custom_gemini_key: Optional[str] = None,
        custom_openrouter_key: Optional[str] = None,
        custom_model_chain: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[List[PlannedMealItem], str, str]:
        """
        Generate daily meal plan across the user's priority model chain.
        Returns (planned_meals_list, provider_name, model_id).
        """
        errors_collected: List[str] = []
        chain_to_use = custom_model_chain if custom_model_chain is not None else self.model_chain
        if not chain_to_use:
            raise AllProvidersFailedError("Все модели AI отключены в конфигурации. Включите хотя бы одну модель в настройках профиля.")

        try:
            async with asyncio.timeout(55.0):
                for provider_type, model_id in chain_to_use:
                    provider = self._get_provider_instance(
                        provider_type,
                        model_id,
                        gemini_key=custom_gemini_key,
                        openrouter_key=custom_openrouter_key,
                    )
                    if not provider:
                        continue

                    logger.info(f"Attempting meal plan generation using {provider_type} / {model_id}...")

                    for attempt in range(1, 3):
                        try:
                            async with asyncio.timeout(20.0):
                                meals_list = await provider.generate_meal_plan(
                                    prompt=prompt,
                                    expected_count=expected_count,
                                    max_calories=max_calories,
                                )
                            logger.info(
                                f"Successfully generated {len(meals_list)} meals using {provider_type}/{model_id}"
                            )
                            return meals_list, provider_type, model_id
                        except (asyncio.TimeoutError, TimeoutError):
                            logger.warning(f"Timeout (20s) on plan {provider_type}/{model_id} (attempt {attempt}).")
                            errors_collected.append(f"{provider_type}/{model_id}: timeout")
                            break
                        except (AIAuthenticationError, AIRateLimitError) as err:
                            logger.warning(f"Failover on {provider_type}/{model_id}: {err}")
                            errors_collected.append(f"{provider_type}/{model_id}: {err}")
                            break
                        except AIProviderError as err:
                            logger.warning(f"Attempt {attempt}/2 failed for {provider_type}/{model_id}: {err}")
                            errors_collected.append(f"{provider_type}/{model_id} (try {attempt}): {err}")
                            err_str = str(err).lower()
                            if any(term in err_str for term in ["high demand", "503", "unavailable", "заблокирован", "not supported", "resource_exhausted"]):
                                break
                            if attempt == 1:
                                await asyncio.sleep(2)
                        except Exception as ex:
                            logger.error(f"Unexpected error in {provider_type}/{model_id}: {ex}", exc_info=True)
                            errors_collected.append(f"{provider_type}/{model_id}: {ex}")
                            break

        except (asyncio.TimeoutError, TimeoutError):
            logger.error(f"Overall AI cascade timeout exceeded for meal plan (55.0s). Errors: {errors_collected}")
            raise AllProvidersFailedError(
                "Превышено время ожидания составления меню (55 сек). Пожалуйста, повторите попытку."
            )

        logger.error(f"All AI models failed for meal plan generation: {errors_collected}")
        raise AllProvidersFailedError(
            "Все модели AI в данный момент перегружены или недоступны. Попробуйте нажать кнопку генерации ещё раз через несколько секунд."
        )


# Global default instance
ai_router = AIRouter()
