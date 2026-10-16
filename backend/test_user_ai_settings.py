import io
import json
import time
from unittest.mock import patch, AsyncMock
from PIL import Image
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.schemas.ai import FoodAnalysisResult
from app.services.ai_router import DEFAULT_MODEL_CHAIN


@pytest.mark.asyncio
async def test_user_ai_settings_lifecycle_and_effects():
    """
    Test suite for user AI model priorities & settings:
    1. GET default settings when none saved
    2. PUT custom settings (order, enabled flags, custom API keys)
    3. GET persisted settings after reload
    4. Saved settings effect on /api/ai/analyze-text
    5. Header overrides taking priority over saved settings
    6. Saved settings effect on /api/ai/recognize (photo)
    7. Saved settings effect on /api/meals/{id}/recalculate
    8. User isolation (User 2 is not affected by User 1)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)

        # -------------------------------------------------------------
        # 1. Register User 1
        # -------------------------------------------------------------
        reg_res = await client.post(
            "/api/auth/register",
            json={
                "email": f"ai_user_{ts}@example.com",
                "password": "Password123!",
                "name": "AI User One",
            },
        )
        assert reg_res.status_code == 201, reg_res.text
        token1 = reg_res.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # -------------------------------------------------------------
        # 2. GET /api/profile/ai-settings (defaults)
        # -------------------------------------------------------------
        get_res = await client.get("/api/profile/ai-settings", headers=headers1)
        assert get_res.status_code == 200, get_res.text
        defaults_data = get_res.json()
        assert "models" in defaults_data
        assert len(defaults_data["models"]) == len(DEFAULT_MODEL_CHAIN)
        assert defaults_data["gemini_api_key"] is None
        assert defaults_data["openrouter_api_key"] is None

        # Verify first default model is gemini-3.1-flash-lite
        assert defaults_data["models"][0]["id"] == DEFAULT_MODEL_CHAIN[0][1]
        assert defaults_data["models"][0]["provider"] == DEFAULT_MODEL_CHAIN[0][0]
        assert defaults_data["models"][0]["enabled"] is True

        # -------------------------------------------------------------
        # 3. PUT /api/profile/ai-settings with custom order & keys
        # -------------------------------------------------------------
        custom_models_payload = [
            {
                "id": "openrouter/auto",
                "name": "OpenRouter Auto",
                "provider": "openrouter",
                "description": "Auto selection",
                "enabled": True,
            },
            {
                "id": "gemini-3.8-flash",
                "name": "Gemini 3.8 Flash",
                "provider": "gemini",
                "description": "High reasoning",
                "enabled": True,
            },
            {
                "id": "gemini-3.1-flash-lite",
                "name": "Gemini 3.1 Flash-Lite",
                "provider": "gemini",
                "description": "Disabled model",
                "enabled": False,  # Disabled
            },
        ]

        put_res = await client.put(
            "/api/profile/ai-settings",
            json={
                "models": custom_models_payload,
                "gemini_api_key": "user1-gemini-secret-key",
                "openrouter_api_key": "user1-openrouter-secret-key",
            },
            headers=headers1,
        )
        assert put_res.status_code == 200, put_res.text
        saved_data = put_res.json()
        assert len(saved_data["models"]) == 3
        assert saved_data["models"][0]["id"] == "openrouter/auto"
        assert saved_data["models"][1]["id"] == "gemini-3.8-flash"
        assert saved_data["models"][2]["enabled"] is False
        assert saved_data["has_gemini_key"] is True
        assert saved_data["has_openrouter_key"] is True
        assert "..." in saved_data["gemini_api_key"]
        assert "..." in saved_data["openrouter_api_key"]

        # -------------------------------------------------------------
        # 4. GET /api/profile/ai-settings to verify persistence
        # -------------------------------------------------------------
        get_saved_res = await client.get("/api/profile/ai-settings", headers=headers1)
        assert get_saved_res.status_code == 200
        persisted = get_saved_res.json()
        assert len(persisted["models"]) == 3
        assert persisted["models"][0]["id"] == "openrouter/auto"
        assert persisted["models"][1]["id"] == "gemini-3.8-flash"
        assert persisted["models"][2]["id"] == "gemini-3.1-flash-lite"
        assert persisted["models"][2]["enabled"] is False
        assert persisted["has_gemini_key"] is True
        assert persisted["has_openrouter_key"] is True
        assert "..." in persisted["gemini_api_key"]
        assert "..." in persisted["openrouter_api_key"]

        # -------------------------------------------------------------
        # 5. Test saved settings effect on POST /api/ai/analyze-text
        # -------------------------------------------------------------
        mock_food_res = FoodAnalysisResult(
            name="Овсяная каша",
            weight_grams=200.0,
            calories=180.0,
            protein=6.0,
            fat=3.0,
            carbs=32.0,
            confidence="high",
        )

        with patch("app.routers.ai.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_text:
            mock_text.return_value = (mock_food_res, "openrouter", "openrouter/auto")

            res_text = await client.post(
                "/api/ai/analyze-text",
                json={"text": "Овсянка на воде 200 грамм"},
                headers=headers1,
            )
            assert res_text.status_code == 200
            assert mock_text.called

            # Check kwargs passed to recognize_food_by_text
            call_kwargs = mock_text.call_args.kwargs
            # Should receive user's saved keys
            assert call_kwargs.get("custom_gemini_key") == "user1-gemini-secret-key"
            assert call_kwargs.get("custom_openrouter_key") == "user1-openrouter-secret-key"
            # Should receive user's saved chain (enabled models only!)
            expected_chain = [("openrouter", "openrouter/auto"), ("gemini", "gemini-3.8-flash")]
            assert call_kwargs.get("custom_model_chain") == expected_chain

        # -------------------------------------------------------------
        # 6. Test Header override takes precedence over saved DB settings
        # -------------------------------------------------------------
        header_override_models = json.dumps([{"provider": "gemini", "id": "gemini-3.6-flash"}])
        with patch("app.routers.ai.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_text_override:
            mock_text_override.return_value = (mock_food_res, "gemini", "gemini-3.6-flash")

            res_override = await client.post(
                "/api/ai/analyze-text",
                json={"text": "Овсянка на воде 200 грамм"},
                headers={
                    **headers1,
                    "X-Gemini-Key": "override-gem-key",
                    "X-OpenRouter-Key": "override-open-key",
                    "X-AI-Models": header_override_models,
                },
            )
            assert res_override.status_code == 200
            override_kwargs = mock_text_override.call_args.kwargs
            assert override_kwargs.get("custom_gemini_key") == "override-gem-key"
            assert override_kwargs.get("custom_openrouter_key") == "override-open-key"
            assert override_kwargs.get("custom_model_chain") == [("gemini", "gemini-3.6-flash")]

        # -------------------------------------------------------------
        # 7. Test saved settings effect on POST /api/ai/recognize (photo)
        # -------------------------------------------------------------
        test_img = Image.new("RGB", (200, 200), color=(100, 200, 50))
        img_buf = io.BytesIO()
        test_img.save(img_buf, format="JPEG")
        img_bytes = img_buf.getvalue()

        with patch("app.routers.ai.ai_router.recognize_food", new_callable=AsyncMock) as mock_photo:
            mock_photo.return_value = (mock_food_res, "openrouter", "openrouter/auto")

            res_photo = await client.post(
                "/api/ai/recognize",
                files={"photo": ("plate.jpg", img_bytes, "image/jpeg")},
                data={"comment": "Завтрак"},
                headers=headers1,
            )
            assert res_photo.status_code == 200
            assert mock_photo.called
            photo_kwargs = mock_photo.call_args.kwargs
            assert photo_kwargs.get("custom_gemini_key") == "user1-gemini-secret-key"
            assert photo_kwargs.get("custom_openrouter_key") == "user1-openrouter-secret-key"
            assert photo_kwargs.get("custom_model_chain") == expected_chain

        # -------------------------------------------------------------
        # 8. Test saved settings effect on POST /api/meals/{id}/recalculate
        # -------------------------------------------------------------
        # Create meal first
        meal_create_res = await client.post(
            "/api/meals",
            json={
                "name": "Овсяная каша",
                "calories": 180.0,
                "protein": 6.0,
                "fat": 3.0,
                "carbs": 32.0,
                "weight_grams": 200.0,
                "user_comment": "Без сахара",
            },
            headers=headers1,
        )
        assert meal_create_res.status_code == 201
        meal_id = meal_create_res.json()["id"]

        with patch("app.routers.meals.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_recalc:
            mock_recalc.return_value = (mock_food_res, "openrouter", "openrouter/auto")

            recalc_res = await client.post(
                f"/api/meals/{meal_id}/recalculate",
                json={"user_comment": "Добавил ложку мёда"},
                headers=headers1,
            )
            assert recalc_res.status_code == 200
            assert mock_recalc.called
            recalc_kwargs = mock_recalc.call_args.kwargs
            assert recalc_kwargs.get("custom_gemini_key") == "user1-gemini-secret-key"
            assert recalc_kwargs.get("custom_openrouter_key") == "user1-openrouter-secret-key"
            assert recalc_kwargs.get("custom_model_chain") == expected_chain

        # -------------------------------------------------------------
        # 9. Test isolation between users
        # -------------------------------------------------------------
        reg_res2 = await client.post(
            "/api/auth/register",
            json={
                "email": f"ai_user2_{ts}@example.com",
                "password": "Password123!",
                "name": "AI User Two",
            },
        )
        assert reg_res2.status_code == 201
        token2 = reg_res2.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        get_user2 = await client.get("/api/profile/ai-settings", headers=headers2)
        assert get_user2.status_code == 200
        user2_data = get_user2.json()
        # User 2 should have default settings, not User 1's settings!
        assert len(user2_data["models"]) == len(DEFAULT_MODEL_CHAIN)
        assert user2_data["models"][0]["id"] == DEFAULT_MODEL_CHAIN[0][1]
        assert user2_data["gemini_api_key"] is None
        assert user2_data["openrouter_api_key"] is None
