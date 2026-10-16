import io
import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.user import User
from app.schemas.ai import FoodAnalysisResult, PlannedMealItem, MealIngredientItem
from app.services.auth import create_access_token
from app.services.ai_router import ai_router, AllProvidersFailedError
from app.utils.ai_providers.base import (
    build_voice_prompt,
    build_meal_plan_prompt,
    parse_food_result,
    parse_meal_plan_result,
    AIProviderError,
)
from app.utils.ai_providers.gemini import GeminiProvider
from app.utils.ai_providers.openrouter import OpenRouterProvider


def test_build_voice_prompt():
    prompt = build_voice_prompt()
    assert "transcription" in prompt
    assert "дословная текстовая расшифровка" in prompt
    assert "ingredients" in prompt
    assert "weight_grams" in prompt
    assert "calories" in prompt


def test_build_meal_plan_prompt():
    prompt = build_meal_plan_prompt(
        meals_to_generate=3,
        max_calories=1500.0,
        target_protein=120.0,
        target_fat=50.0,
        target_carbs=140.0,
        user_preferences="без глютена",
        locked_meal_names=["Овсянка с ягодами"],
        favorite_products_hint="Творог, Куриная грудка",
    )
    assert "3 блюд(а)" in prompt
    assert "1500 ккал" in prompt
    assert "НЕ ДОЛЖНА ПРЕВЫШАТЬ" in prompt
    assert "без глютена" in prompt
    assert "Овсянка с ягодами" in prompt
    assert "Творог, Куриная грудка" in prompt


def test_parse_food_result_with_transcription():
    raw_json = {
        "name": "Омлет с сыром",
        "weight_grams": 250,
        "calories": 380,
        "protein": 24,
        "fat": 28,
        "carbs": 4,
        "confidence": "high",
        "transcription": "Я съел омлет из двух яиц с сыром грамм 250",
        "ingredients": [
            {"name": "Яйца", "weight_grams": 150, "calories": 210, "protein": 18, "fat": 15, "carbs": 1},
            {"name": "Сыр", "weight_grams": 100, "calories": 170, "protein": 6, "fat": 13, "carbs": 3},
        ],
    }
    result = parse_food_result(raw_json)
    assert result.name == "Омлет с сыром"
    assert result.transcription == "Я съел омлет из двух яиц с сыром грамм 250"
    assert len(result.ingredients) == 2


def test_parse_meal_plan_result_ceiling_scaling():
    # Test that when calories exceed max_calories, hard scaling down is applied
    raw_json = {
        "meals": [
            {
                "meal_label": "Завтрак",
                "name": "Овсянка с бананом",
                "weight_grams": 300,
                "calories": 600,
                "protein": 15,
                "fat": 10,
                "carbs": 110,
                "ingredients": [
                    {"name": "Овсяные хлопья", "weight_grams": 100, "calories": 350, "protein": 12, "fat": 6, "carbs": 60},
                    {"name": "Банан", "weight_grams": 200, "calories": 250, "protein": 3, "fat": 4, "carbs": 50},
                ],
            },
            {
                "meal_label": "Обед",
                "name": "Гречка с курицей",
                "weight_grams": 400,
                "calories": 800,
                "protein": 50,
                "fat": 20,
                "carbs": 100,
                "ingredients": [
                    {"name": "Куриное филе", "weight_grams": 200, "calories": 330, "protein": 46, "fat": 7, "carbs": 0},
                    {"name": "Гречка варёная", "weight_grams": 200, "calories": 470, "protein": 4, "fat": 13, "carbs": 100},
                ],
            },
        ]
    }
    # Total calories = 600 + 800 = 1400.
    # Max calories limit = 1000.
    parsed = parse_meal_plan_result(raw_json, expected_count=2, max_calories=1000.0)
    assert len(parsed) == 2
    total_cal = sum(m.calories for m in parsed)
    assert total_cal <= 1000.0
    assert total_cal > 900.0  # Scaled to approx 98% of 1000


@pytest.mark.asyncio
async def test_gemini_provider_analyze_food_voice_and_meal_plan():
    provider = GeminiProvider(api_key="test-key", model_id="gemini-3.8-flash")
    with patch.object(provider, "_send_and_extract_json", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {
            "name": "Салат Греческий",
            "weight_grams": 200,
            "calories": 180,
            "protein": 5,
            "fat": 14,
            "carbs": 8,
            "confidence": "high",
            "transcription": "Съел греческий салат",
            "ingredients": [],
        }
        res = await provider.analyze_food_voice(b"fake-ogg-audio", mime_type="audio/ogg")
        assert res.name == "Салат Греческий"
        assert res.transcription == "Съел греческий салат"

        mock_extract.return_value = {
            "meals": [
                {
                    "meal_label": "Ужин",
                    "name": "Творог с ягодами",
                    "weight_grams": 200,
                    "calories": 250,
                    "protein": 30,
                    "fat": 5,
                    "carbs": 20,
                    "ingredients": [],
                }
            ]
        }
        plan = await provider.generate_meal_plan("prompt", expected_count=1, max_calories=300.0)
        assert len(plan) == 1
        assert plan[0].name == "Творог с ягодами"


@pytest.mark.asyncio
async def test_openrouter_provider_analyze_food_voice_and_meal_plan():
    provider = OpenRouterProvider(api_key="test-key", model_id="openrouter/auto")
    with patch.object(provider, "_send_and_extract_json", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {
            "name": "Борщ",
            "weight_grams": 350,
            "calories": 280,
            "protein": 14,
            "fat": 12,
            "carbs": 25,
            "confidence": "high",
            "transcription": "Тарелка борща со сметаной",
            "ingredients": [],
        }
        res = await provider.analyze_food_voice(b"fake-audio", mime_type="audio/wav")
        assert res.name == "Борщ"
        assert res.transcription == "Тарелка борща со сметаной"

        mock_extract.return_value = {
            "meals": [
                {
                    "meal_label": "Обед",
                    "name": "Борщ",
                    "weight_grams": 350,
                    "calories": 280,
                    "protein": 14,
                    "fat": 12,
                    "carbs": 25,
                    "ingredients": [],
                }
            ]
        }
        plan = await provider.generate_meal_plan("prompt", expected_count=1, max_calories=400.0)
        assert len(plan) == 1
        assert plan[0].name == "Борщ"


@pytest.mark.asyncio
async def test_ai_router_voice_fallback():
    # Test that ai_router falls back to next model on failure
    custom_chain = [("gemini", "gemini-3.8-flash"), ("openrouter", "openrouter/auto")]
    mock_food_res = FoodAnalysisResult(
        name="Тост с авокадо",
        weight_grams=150,
        calories=220,
        protein=6,
        fat=12,
        carbs=22,
        confidence="high",
        transcription="Тост с авокадо на завтрак",
        ingredients=[],
    )

    with patch.object(GeminiProvider, "analyze_food_voice", side_effect=AIProviderError("Gemini busy")), \
         patch.object(OpenRouterProvider, "analyze_food_voice", return_value=mock_food_res):

        res, prov, mod = await ai_router.recognize_food_by_voice(
            audio_bytes=b"dummy",
            mime_type="audio/ogg",
            custom_gemini_key="gem-key",
            custom_openrouter_key="open-key",
            custom_model_chain=custom_chain,
        )
        assert res.name == "Тост с авокадо"
        assert res.transcription == "Тост с авокадо на завтрак"
        assert prov == "openrouter"
        assert mod == "openrouter/auto"


@pytest.mark.asyncio
async def test_api_recognize_voice_endpoint():
    import time
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ts = int(time.time() * 1000)
        reg_res = await ac.post(
            "/api/auth/register",
            json={"email": f"voice_test_{ts}@example.com", "password": "Password123!", "name": "Voice Tester"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test empty audio file
        empty_files = {"audio": ("voice.ogg", b"", "audio/ogg")}
        resp = await ac.post("/api/ai/recognize-voice", files=empty_files, headers=headers)
        assert resp.status_code == 400
        assert "Аудиофайл пуст" in resp.json()["detail"]

        # 2. Test successful recognition mock
        mock_food_res = FoodAnalysisResult(
            name="Каша овсяная",
            weight_grams=200,
            calories=180,
            protein=6,
            fat=4,
            carbs=30,
            confidence="high",
            transcription="Овсяная каша на воде 200 грамм",
            ingredients=[],
        )
        with patch.object(ai_router, "recognize_food_by_voice", new_callable=AsyncMock) as mock_voice:
            mock_voice.return_value = (mock_food_res, "gemini", "gemini-3.8-flash")
            valid_files = {"audio": ("voice.ogg", b"fake-audio-bytes-content", "audio/ogg")}
            resp2 = await ac.post("/api/ai/recognize-voice", files=valid_files, headers=headers)
            assert resp2.status_code == 200
            data = resp2.json()
            assert data["name"] == "Каша овсяная"
            assert data["transcription"] == "Овсяная каша на воде 200 грамм"
            assert data["calories"] == 180
            assert data["provider_used"] == "gemini"
            assert data["model_used"] == "gemini-3.8-flash"


@pytest.mark.asyncio
async def test_api_meal_plan_lifecycle():
    import time
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ts = int(time.time() * 1000)
        reg_res = await ac.post(
            "/api/auth/register",
            json={"email": f"plan_test_{ts}@example.com", "password": "Password123!", "name": "Plan Tester"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        target_date = "2026-10-18"

        # 1. Initially no plan exists
        get_res = await ac.get(f"/api/meal-plan?date={target_date}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json() is None

        # 2. Generate meal plan with mock
        mock_meals = [
            PlannedMealItem(
                id="plan-1",
                meal_label="Завтрак",
                name="Сырники со сметаной",
                weight_grams=200,
                calories=350,
                protein=25,
                fat=15,
                carbs=28,
                ingredients=[MealIngredientItem(name="Творог 5%", weight_grams=150, calories=180, protein=24, fat=8, carbs=4)],
                locked=False,
                added_to_diary=False,
            ),
            PlannedMealItem(
                id="plan-2",
                meal_label="Обед",
                name="Куриный суп с лапшой",
                weight_grams=350,
                calories=400,
                protein=30,
                fat=12,
                carbs=40,
                ingredients=[],
                locked=False,
                added_to_diary=False,
            ),
        ]

        with patch.object(ai_router, "generate_meal_plan", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = (mock_meals, "gemini", "gemini-3.8-flash")

            gen_payload = {
                "plan_date": target_date,
                "meals_count": 2,
                "target_calories": 1000.0,
                "target_protein": 70.0,
                "target_fat": 30.0,
                "target_carbs": 100.0,
                "user_preferences": "без сахара",
                "locked_meals": [],
            }
            post_res = await ac.post("/api/meal-plan/generate", json=gen_payload, headers=headers)
            assert post_res.status_code == 200
            plan_data = post_res.json()
            assert plan_data["plan_date"] == target_date
            assert plan_data["meals_count"] == 2
            assert len(plan_data["meals"]) == 2
            assert plan_data["meals"][0]["name"] == "Сырники со сметаной"
            assert plan_data["total_generated_calories"] == 750.0

        # 3. Fetch saved plan from DB
        get_res2 = await ac.get(f"/api/meal-plan?date={target_date}", headers=headers)
        assert get_res2.status_code == 200
        saved_plan = get_res2.json()
        assert saved_plan is not None
        assert saved_plan["id"] == plan_data["id"]
        assert len(saved_plan["meals"]) == 2

        # 4. Save updated state (lock first meal)
        saved_plan["meals"][0]["locked"] = True
        save_payload = {
            "plan_date": target_date,
            "meals_count": saved_plan["meals_count"],
            "target_calories": saved_plan["target_calories"],
            "target_protein": saved_plan["target_protein"],
            "target_fat": saved_plan["target_fat"],
            "target_carbs": saved_plan["target_carbs"],
            "user_preferences": saved_plan["user_preferences"],
            "meals": saved_plan["meals"],
        }
        put_res = await ac.put("/api/meal-plan/save", json=save_payload, headers=headers)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["meals"][0]["locked"] is True


@pytest.mark.asyncio
async def test_api_telegram_lifecycle():
    import time
    from app.services.telegram_bot import telegram_bot_service
    from app.database import AsyncSessionLocal

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ts = int(time.time() * 1000)
        reg_res = await ac.post(
            "/api/auth/register",
            json={"email": f"tg_test_{ts}@example.com", "password": "Password123!", "name": "TG Tester"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Check initial status
        st_res = await ac.get("/api/telegram/status", headers=headers)
        assert st_res.status_code == 200
        st = st_res.json()
        assert st["is_linked"] is False
        assert st["bot_username"] == "KaloriiV2bot"
        assert st["link_code"] is None

        # 2. Generate link code
        code_res = await ac.post("/api/telegram/link-code", headers=headers)
        assert code_res.status_code == 200
        code_data = code_res.json()
        link_code = code_data["link_code"]
        assert link_code.startswith("KLR-")
        assert len(link_code) == 10
        assert "t.me/KaloriiV2bot?start=KLR-" in code_data["deep_link_url"]

        # 3. Simulate bot linking via TelegramBotService._handle_link_code
        async with AsyncSessionLocal() as session:
            fake_chat_id = 999888777 + (ts % 10000)
            with patch.object(telegram_bot_service, "send_message", new_callable=AsyncMock) as mock_send:
                linked_ok = await telegram_bot_service._handle_link_code(
                    session, fake_chat_id, "test_tg_user", link_code
                )
                assert linked_ok is True
                assert mock_send.called

        # 4. Verify user is now linked
        st_res2 = await ac.get("/api/telegram/status", headers=headers)
        assert st_res2.status_code == 200
        st2 = st_res2.json()
        assert st2["is_linked"] is True
        assert st2["telegram_chat_id"] == fake_chat_id
        assert st2["telegram_username"] == "test_tg_user"

        # 5. Unlink account
        del_res = await ac.delete("/api/telegram/unlink", headers=headers)
        assert del_res.status_code == 200
        st3 = del_res.json()
        assert st3["is_linked"] is False

        # Verify status is unlinked
        st_res4 = await ac.get("/api/telegram/status", headers=headers)
        assert st_res4.json()["is_linked"] is False

