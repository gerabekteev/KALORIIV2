import time
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.schemas.ai import PlannedMealItem, MealIngredientItem


@pytest.mark.asyncio
async def test_meal_plan_overbudget_validation_and_lock_handling():
    """Tests LOGIC-03: meal plan generation enforces budget constraints when meals are locked."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"plan_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Шеф-Повар"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Attempt to generate plan where locked meals exceed target calories -> 400 Bad Request
        overbudget_payload = {
            "plan_date": "2026-10-15",
            "meals_count": 3,
            "target_calories": 1500.0,
            "target_protein": 110.0,
            "target_fat": 50.0,
            "target_carbs": 150.0,
            "user_preferences": "без лактозы",
            "locked_meals": [
                {
                    "id": "locked-1",
                    "meal_label": "Завтрак",
                    "name": "Овсяная каша с орехами",
                    "weight_grams": 350.0,
                    "calories": 600.0,
                    "protein": 20.0,
                    "fat": 20.0,
                    "carbs": 80.0,
                    "recipe_hint": "Варить 10 минут",
                    "locked": True,
                },
                {
                    "id": "locked-2",
                    "meal_label": "Обед",
                    "name": "Стейк из говядины с картофелем",
                    "weight_grams": 450.0,
                    "calories": 1000.0,
                    "protein": 60.0,
                    "fat": 40.0,
                    "carbs": 70.0,
                    "recipe_hint": "Жарить на гриле",
                    "locked": True,
                },
            ],
        }

        # 600 + 1000 = 1600 kcal > 1500 kcal target
        res_bad = await client.post("/api/meal-plan/generate", json=overbudget_payload, headers=headers)
        assert res_bad.status_code == 400
        assert "превышает" in res_bad.json()["detail"].lower()

        # 2. All meals locked -> does not call external AI, returns immediately with local/locked
        all_locked_payload = {
            "plan_date": "2026-10-15",
            "meals_count": 2,
            "target_calories": 2000.0,
            "target_protein": 120.0,
            "target_fat": 60.0,
            "target_carbs": 200.0,
            "user_preferences": "здоровое питание",
            "locked_meals": [
                {
                    "id": "locked-a",
                    "meal_label": "Завтрак",
                    "name": "Омлет с сыром",
                    "weight_grams": 250.0,
                    "calories": 380.0,
                    "protein": 24.0,
                    "fat": 26.0,
                    "carbs": 4.0,
                    "recipe_hint": "Взбить и поджарить",
                    "locked": True,
                },
                {
                    "id": "locked-b",
                    "meal_label": "Обед",
                    "name": "Куриное филе с рисом",
                    "weight_grams": 350.0,
                    "calories": 520.0,
                    "protein": 45.0,
                    "fat": 10.0,
                    "carbs": 60.0,
                    "recipe_hint": "Отварить",
                    "locked": True,
                },
            ],
        }
        res_ok = await client.post("/api/meal-plan/generate", json=all_locked_payload, headers=headers)
        assert res_ok.status_code == 200
        data_ok = res_ok.json()
        assert data_ok["meals_count"] == 2
        assert len(data_ok["meals"]) == 2
        assert data_ok["provider_used"] == "local"
        assert data_ok["model_used"] == "locked"
        assert data_ok["total_generated_calories"] == 380.0 + 520.0

        # 3. GET /api/meal-plan retrieves the saved plan
        res_get = await client.get("/api/meal-plan?date=2026-10-15", headers=headers)
        assert res_get.status_code == 200
        saved_plan = res_get.json()
        assert saved_plan["id"] == data_ok["id"]
        assert len(saved_plan["meals"]) == 2

        # 4. PUT /api/meal-plan/save updates the state (e.g. marked as added to diary)
        updated_meals = data_ok["meals"]
        updated_meals[0]["added_to_diary"] = True
        save_res = await client.put(
            "/api/meal-plan/save",
            json={
                "plan_date": "2026-10-15",
                "target_calories": 2000.0,
                "meals": updated_meals,
            },
            headers=headers,
        )
        assert save_res.status_code == 200
        saved_again = save_res.json()
        assert saved_again["meals"][0]["added_to_diary"] is True


@pytest.mark.asyncio
async def test_elastic_weekly_banking_and_stats():
    """Tests GC-02: Weekly Calorie Bank surplus/deficit accumulation across multiple days."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"bank_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Банкир Калорий"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Set user daily goal to 2000 kcal
        await client.put("/api/profile", json={"daily_calories_goal": 2000}, headers=headers)

        # Log meals over 3 days:
        # Day 1: 1700 kcal (-300 saved)
        # Day 2: 2200 kcal (+200 over)
        # Day 3: 1800 kcal (-200 saved)
        today = datetime.now(timezone.utc).date()
        days_data = [
            ((today - timedelta(days=2)).isoformat(), 1700.0),
            ((today - timedelta(days=1)).isoformat(), 2200.0),
            (today.isoformat(), 1800.0),
        ]
        for d, cal in days_data:
            await client.post(
                "/api/meals",
                json={
                    "name": f"Рацион за {d}",
                    "calories": cal,
                    "protein": 120.0,
                    "fat": 50.0,
                    "carbs": 180.0,
                    "weight_grams": 1000.0,
                    "meal_date": d,
                    "meal_time": "14:00:00",
                },
                headers=headers,
            )

        # Fetch weekly stats
        stats_res = await client.get("/api/stats?period=week", headers=headers)
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert stats["tracked_days"] >= 3 or stats["days_tracked"] >= 3
        assert stats["total_calories"] >= 5700.0
