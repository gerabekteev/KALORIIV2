import pytest
import time
import json
from datetime import date, datetime, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import AsyncSessionLocal
from app.models.product import Product
from app.models.meal import Meal
from sqlalchemy import select


@pytest.mark.asyncio
async def test_backend_bugfixes_and_features():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email1 = f"user1_{ts}@test.com"
        email2 = f"user2_{ts}@test.com"

        # Register User 1
        res1 = await client.post("/api/auth/register", json={"email": email1, "password": "Password123!", "name": "User 1"})
        assert res1.status_code == 201
        token1 = res1.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # Register User 2
        res2 = await client.post("/api/auth/register", json={"email": email2, "password": "Password123!", "name": "User 2"})
        assert res2.status_code == 201
        token2 = res2.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        # ------------------------------------------------------------------
        # BUG-B09: Custom product fields preservation
        # ------------------------------------------------------------------
        prod_payload = {
            "name": f"Творог {ts}",
            "calories_per_100g": 105.0,
            "protein_per_100g": 18.0,
            "fat_per_100g": 2.0,
            "carbs_per_100g": 3.0,
            "category": "Молочные продукты",
            "barcode": f"460123456{ts % 10000:04d}",
            "brand": "ВкусВилл",
            "image_url": "/uploads/tvorog.jpg",
            "package_weight_grams": 200.0,
        }
        res_prod = await client.post("/api/products", json=prod_payload, headers=headers1)
        assert res_prod.status_code == 201
        created_prod = res_prod.json()
        assert created_prod["barcode"] == prod_payload["barcode"]
        assert created_prod["brand"] == "ВкусВилл"
        assert created_prod["image_url"] == "/uploads/tvorog.jpg"
        assert created_prod["package_weight_grams"] == 200.0
        prod1_id = created_prod["id"]

        # ------------------------------------------------------------------
        # BUG-B07: IDOR in update_barcode_product
        # ------------------------------------------------------------------
        # User 2 tries to update User 1's custom product -> 403 Forbidden
        update_idor_res = await client.put(
            f"/api/barcode/product/{prod1_id}",
            json={
                "name": "Взломанный творог",
                "calories_per_100g": 999.0,
                "protein_per_100g": 99.0,
                "fat_per_100g": 99.0,
                "carbs_per_100g": 99.0,
            },
            headers=headers2,
        )
        assert update_idor_res.status_code == 403, f"Expected 403 Forbidden on IDOR, got {update_idor_res.status_code}"

        # ------------------------------------------------------------------
        # BUG-B08: Recipe product lookup scoping
        # ------------------------------------------------------------------
        # User 2 tries to include User 1's private custom product into a recipe -> 404
        recipe_fail_res = await client.post(
            "/api/recipes",
            json={
                "name": "Чужой рецепт",
                "items": [{"product_id": prod1_id, "weight_grams": 100.0}],
            },
            headers=headers2,
        )
        assert recipe_fail_res.status_code == 404, f"Expected 404 for inaccessible product, got {recipe_fail_res.status_code}"

        # ------------------------------------------------------------------
        # BUG-B14: Direct macro storage in recipes without fake products
        # ------------------------------------------------------------------
        quick_recipe_res = await client.post(
            "/api/recipes",
            json={
                "name": "Быстрый омлет",
                "description": "Без создания фейкового продукта",
                "items": [],
                "total_calories": 250.0,
                "total_protein": 18.0,
                "total_fat": 15.0,
                "total_carbs": 2.0,
                "total_weight_grams": 180.0,
            },
            headers=headers1,
        )
        assert quick_recipe_res.status_code == 201
        saved_q_recipe = quick_recipe_res.json()
        assert saved_q_recipe["total_calories"] == 250.0
        assert saved_q_recipe["total_protein"] == 18.0
        assert len(saved_q_recipe["items"]) == 0

        # Verify search products does not include category "Рецепты"
        search_res = await client.get("/api/products", headers=headers1)
        assert search_res.status_code == 200
        for p in search_res.json():
            assert p.get("category") != "Рецепты"

        # ------------------------------------------------------------------
        # FEAT-01: Multi-component meal creation with ingredients
        # ------------------------------------------------------------------
        meal_payload = {
            "name": "Гречка с курицей и салатом",
            "calories": 450.0,
            "protein": 35.0,
            "fat": 10.0,
            "carbs": 55.0,
            "weight_grams": 350.0,
            "user_comment": "Обед после тренировки",
            "ingredients": [
                {"name": "Гречневая каша", "weight_grams": 150.0, "calories": 180.0, "protein": 6.0, "fat": 2.0, "carbs": 35.0},
                {"name": "Куриное филе", "weight_grams": 120.0, "calories": 190.0, "protein": 27.0, "fat": 4.0, "carbs": 0.0},
                {"name": "Овощной салат", "weight_grams": 80.0, "calories": 80.0, "protein": 2.0, "fat": 4.0, "carbs": 20.0},
            ],
        }
        res_meal = await client.post("/api/meals", json=meal_payload, headers=headers1)
        assert res_meal.status_code == 201
        created_meal = res_meal.json()
        assert len(created_meal["ingredients"]) == 3
        assert created_meal["ingredients"][0]["name"] == "Гречневая каша"
        assert created_meal["ingredients"][1]["weight_grams"] == 120.0
        meal_id = created_meal["id"]

        # ------------------------------------------------------------------
        # BUG-B10: Can clear user_comment in update_meal
        # ------------------------------------------------------------------
        clear_comment_res = await client.put(
            f"/api/meals/{meal_id}",
            json={"user_comment": None},
            headers=headers1,
        )
        assert clear_comment_res.status_code == 200
        assert clear_comment_res.json()["user_comment"] is None

        # ------------------------------------------------------------------
        # FEAT-02: POST /api/meals/{id}/copy
        # ------------------------------------------------------------------
        tomorrow_str = (date.today() + timedelta(days=1)).isoformat()
        copy_res = await client.post(
            f"/api/meals/{meal_id}/copy",
            json={"target_date": tomorrow_str},
            headers=headers1,
        )
        assert copy_res.status_code == 201
        copied_meal = copy_res.json()
        assert copied_meal["id"] != meal_id
        assert copied_meal["meal_date"] == tomorrow_str
        assert copied_meal["name"] == created_meal["name"]
        assert len(copied_meal["ingredients"]) == 3

        # ------------------------------------------------------------------
        # BUG-B12: Profile weight update rounding
        # ------------------------------------------------------------------
        prof_res = await client.put(
            "/api/profile",
            json={"current_weight_kg": 75.567},
            headers=headers1,
        )
        assert prof_res.status_code == 200
        assert prof_res.json()["current_weight_kg"] == 75.6

        # Clean up
        await client.delete(f"/api/meals/{meal_id}", headers=headers1)
        await client.delete(f"/api/meals/{copied_meal['id']}", headers=headers1)
