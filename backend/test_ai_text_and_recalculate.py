import io
import json
import time
from unittest.mock import patch, AsyncMock
from PIL import Image
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.utils.image import process_image, MAX_IMAGE_DIMENSION
from app.utils.ai_providers.openrouter import OPENROUTER_MODELS
from app.services.ai_router import DEFAULT_MODEL_CHAIN, AIRouter
from app.schemas.ai import FoodAnalysisResult


async def test_image_compression_and_max_dimension():
    """Verify MAX_IMAGE_DIMENSION is 900 and images larger than 900px are resized."""
    assert MAX_IMAGE_DIMENSION == 900

    # Create a 1600x1200 image in RGBA mode
    large_img = Image.new("RGBA", (1600, 1200), color=(255, 100, 50, 200))
    buf = io.BytesIO()
    large_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    compressed_bytes, mime = process_image(png_bytes)
    assert mime == "image/jpeg"

    # Open compressed image and check dimensions
    processed = Image.open(io.BytesIO(compressed_bytes))
    assert processed.mode == "RGB"
    assert processed.width <= 900
    assert processed.height <= 900
    assert processed.width == 900
    assert processed.height == int(1200 * 900 / 1600)  # 675
    print(f"[OK] Image compression resized {large_img.size} to {processed.size}")


def test_model_chain_and_openrouter_catalog():
    """Verify DEFAULT_MODEL_CHAIN and OPENROUTER_MODELS match requirements."""
    expected_chain = [
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
    assert DEFAULT_MODEL_CHAIN == expected_chain

    expected_or_models = [
        "openrouter/auto",
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-31b-it:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ]
    for model in expected_or_models:
        assert model in OPENROUTER_MODELS
    print("[OK] Model chain and OpenRouter catalog verified")


async def test_ai_analyze_text_and_meal_recalculate():
    """Integration test for POST /api/ai/analyze-text and POST /api/meals/{meal_id}/recalculate."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)

        # 1. Register User 1
        reg_res = await client.post(
            "/api/auth/register",
            json={"email": f"ai_text_test_{ts}@example.com", "password": "Password123!", "name": "AI Text Tester"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Register User 2 (for authorization check)
        reg_res2 = await client.post(
            "/api/auth/register",
            json={"email": f"ai_text_other_{ts}@example.com", "password": "Password123!", "name": "Other User"},
        )
        assert reg_res2.status_code == 201
        token2 = reg_res2.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        # 3. Test POST /api/ai/analyze-text validation
        bad_req = await client.post("/api/ai/analyze-text", json={"text": ""}, headers=headers)
        assert bad_req.status_code == 422

        # 4. Test POST /api/ai/analyze-text with mock recognition
        mock_food_res = FoodAnalysisResult(
            name="Борщ с говядиной и сметаной",
            weight_grams=350.0,
            calories=280.0,
            protein=18.0,
            fat=12.0,
            carbs=22.0,
            confidence="high",
        )

        with patch("app.routers.ai.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_rec_text:
            mock_rec_text.return_value = (mock_food_res, "openrouter", "openrouter/auto")

            res = await client.post(
                "/api/ai/analyze-text",
                json={"text": "Тарелка борща с говядиной и ложкой сметаны"},
                headers=headers,
            )
            assert res.status_code == 200
            data = res.json()
            assert data["name"] == "Борщ с говядиной и сметаной"
            assert data["weight_grams"] == 350.0
            assert data["calories"] == 280.0
            assert data["protein"] == 18.0
            assert data["fat"] == 12.0
            assert data["carbs"] == 22.0
            assert data["confidence"] == "high"
            assert data["photo_path"] is None
            assert data["provider_used"] == "openrouter"
            assert data["model_used"] == "openrouter/auto"
            print("[OK] POST /api/ai/analyze-text successfully parsed and returned FoodRecognitionResponse")

        # 5. Create a meal without photo for User 1
        create_res = await client.post(
            "/api/meals",
            json={
                "name": "Гречневая каша",
                "calories": 200.0,
                "protein": 8.0,
                "fat": 2.0,
                "carbs": 40.0,
                "weight_grams": 200.0,
                "user_comment": "Простая каша на воде",
            },
            headers=headers,
        )
        assert create_res.status_code == 201
        meal_id = create_res.json()["id"]

        # 6. Recalculate meal WITHOUT photo
        mock_recalculated_res = FoodAnalysisResult(
            name="Гречневая каша с маслом и сыром",
            weight_grams=250.0,
            calories=370.0,
            protein=16.0,
            fat=15.0,
            carbs=42.0,
            confidence="high",
        )

        with patch("app.routers.meals.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_recalc_text:
            mock_recalc_text.return_value = (mock_recalculated_res, "gemini", "gemini-3.5-flash")

            recalc_res = await client.post(
                f"/api/meals/{meal_id}/recalculate",
                json={"user_comment": "Добавил 30г сливочного масла и 40г сыра"},
                headers=headers,
            )
            assert recalc_res.status_code == 200
            updated_meal = recalc_res.json()
            assert updated_meal["id"] == meal_id
            assert updated_meal["name"] == "Гречневая каша с маслом и сыром"
            assert updated_meal["calories"] == 370.0
            assert updated_meal["protein"] == 16.0
            assert updated_meal["fat"] == 15.0
            assert updated_meal["carbs"] == 42.0
            assert updated_meal["weight_grams"] == 250.0
            assert updated_meal["user_comment"] == "Добавил 30г сливочного масла и 40г сыра"
            assert updated_meal["is_manually_edited"] is True
            raw = json.loads(updated_meal["ai_raw_response"])
            assert raw["provider"] == "gemini"
            assert raw["model"] == "gemini-3.5-flash"

            # Check that mock was called with the updated comment
            mock_recalc_text.assert_called_once()
            args, kwargs = mock_recalc_text.call_args
            assert "сливочного масла" in kwargs.get("text", "") or "сливочного масла" in args[0]
            print("[OK] Recalculate without photo succeeded: updated fields, comment, and macros")

        # 7. Recalculate meal WITH photo on disk
        # Create a dummy image in settings.UPLOAD_DIR
        test_filename = f"test_recalc_{ts}.jpg"
        photo_path = settings.UPLOAD_DIR / test_filename
        dummy_img = Image.new("RGB", (100, 100), color=(120, 200, 80))
        dummy_img.save(photo_path, format="JPEG")

        meal_with_photo_res = await client.post(
            "/api/meals",
            json={
                "name": "Салат овощной",
                "calories": 100.0,
                "protein": 2.0,
                "fat": 1.0,
                "carbs": 20.0,
                "weight_grams": 200.0,
                "photo_path": f"/uploads/{test_filename}",
                "user_comment": "Свежие овощи",
            },
            headers=headers,
        )
        assert meal_with_photo_res.status_code == 201
        photo_meal_id = meal_with_photo_res.json()["id"]

        mock_photo_recalculated = FoodAnalysisResult(
            name="Салат с оливковым маслом и фетой",
            weight_grams=280.0,
            calories=290.0,
            protein=8.0,
            fat=24.0,
            carbs=12.0,
            confidence="high",
        )

        with patch("app.routers.meals.ai_router.recognize_food", new_callable=AsyncMock) as mock_recalc_food:
            mock_recalc_food.return_value = (mock_photo_recalculated, "openrouter", "google/gemma-4-26b-a4b-it:free")

            recalc_photo_res = await client.post(
                f"/api/meals/{photo_meal_id}/recalculate",
                json={"user_comment": "Заправил оливковым маслом и добавил сыр фета"},
                headers=headers,
            )
            assert recalc_photo_res.status_code == 200
            updated_photo_meal = recalc_photo_res.json()
            assert updated_photo_meal["id"] == photo_meal_id
            assert updated_photo_meal["name"] == "Салат с оливковым маслом и фетой"
            assert updated_photo_meal["calories"] == 290.0
            assert updated_photo_meal["user_comment"] == "Заправил оливковым маслом и добавил сыр фета"
            assert updated_photo_meal["is_manually_edited"] is True

            # Verify that recognize_food was called with the image bytes from disk
            mock_recalc_food.assert_called_once()
            call_kwargs = mock_recalc_food.call_args[1]
            assert "image_bytes" in call_kwargs and len(call_kwargs["image_bytes"]) > 0
            assert call_kwargs["user_comment"] == "Заправил оливковым маслом и добавил сыр фета"
            print("[OK] Recalculate with photo succeeded: read image from disk and called recognize_food")

        # Clean up dummy image
        if photo_path.exists():
            photo_path.unlink()

        # 8. Test 404 on recalculate non-existent meal
        res_404 = await client.post(
            "/api/meals/999999/recalculate",
            json={"user_comment": "Любой комментарий"},
            headers=headers,
        )
        assert res_404.status_code == 404
        assert res_404.json()["detail"] == "Приём пищи не найден"

        # 9. Test 404 / access denied on recalculating another user's meal
        res_other = await client.post(
            f"/api/meals/{meal_id}/recalculate",
            json={"user_comment": "Попытка изменить чужое блюдо"},
            headers=headers2,
        )
        assert res_other.status_code == 404
        assert res_other.json()["detail"] == "Приём пищи не найден"
        print("[OK] Authorization and non-existent meal checks verified")
