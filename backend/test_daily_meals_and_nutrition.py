import time
import os
from pathlib import Path
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.meal import Meal


@pytest.mark.asyncio
async def test_multi_ingredient_meal_lifecycle_and_calculations():
    """Tests creating, fetching, scaling ingredients, and deleting ingredients in a meal."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"meal_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Пользователь Дневника"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a multi-component lunch with 3 ingredients
        ingredients = [
            {"name": "Куриное филе отварное", "weight_grams": 150.0, "calories": 247.0, "protein": 46.5, "fat": 5.4, "carbs": 0.0},
            {"name": "Гречневая каша", "weight_grams": 200.0, "calories": 202.0, "protein": 6.4, "fat": 1.8, "carbs": 39.8},
            {"name": "Сливочное масло", "weight_grams": 10.0, "calories": 75.0, "protein": 0.1, "fat": 8.3, "carbs": 0.1},
        ]
        total_weight = sum(i["weight_grams"] for i in ingredients)
        total_cal = sum(i["calories"] for i in ingredients)
        total_p = sum(i["protein"] for i in ingredients)
        total_f = sum(i["fat"] for i in ingredients)
        total_c = sum(i["carbs"] for i in ingredients)

        meal_payload = {
            "name": "Обед: Курица с гречкой и маслом",
            "calories": total_cal,
            "protein": total_p,
            "fat": total_f,
            "carbs": total_c,
            "weight_grams": total_weight,
            "meal_date": "2026-10-14",
            "meal_time": "13:30:00",
            "user_comment": "Домашний полезный обед",
            "ingredients": ingredients,
        }

        res_create = await client.post("/api/meals", json=meal_payload, headers=headers)
        assert res_create.status_code == 201
        created_meal = res_create.json()
        meal_id = created_meal["id"]
        assert len(created_meal["ingredients"]) == 3
        assert created_meal["weight_grams"] == 360.0

        # 2. Fetch meals for this date and verify structured response
        res_get = await client.get("/api/meals?date=2026-10-14", headers=headers)
        assert res_get.status_code == 200
        day_data = res_get.json()
        assert len(day_data["meals"]) == 1
        saved_meal = day_data["meals"][0]
        assert saved_meal["id"] == meal_id
        assert len(saved_meal["ingredients"]) == 3

        # 3. Edit meal: increase buckwheat portion from 200g to 250g (scales buckwheat macros +25%)
        # and remove butter completely
        updated_ingredients = [
            {"name": "Куриное филе отварное", "weight_grams": 150.0, "calories": 247.0, "protein": 46.5, "fat": 5.4, "carbs": 0.0},
            {"name": "Гречневая каша", "weight_grams": 250.0, "calories": 252.5, "protein": 8.0, "fat": 2.25, "carbs": 49.75},
        ]
        new_total_weight = 400.0
        new_total_cal = 247.0 + 252.5
        new_total_p = 46.5 + 8.0
        new_total_f = 5.4 + 2.25
        new_total_c = 0.0 + 49.75

        res_update = await client.put(
            f"/api/meals/{meal_id}",
            json={
                "name": "Обед: Курица с увеличенной гречкой (без масла)",
                "weight_grams": new_total_weight,
                "calories": new_total_cal,
                "protein": new_total_p,
                "fat": new_total_f,
                "carbs": new_total_c,
                "ingredients": updated_ingredients,
            },
            headers=headers,
        )
        assert res_update.status_code == 200
        updated_meal = res_update.json()
        assert len(updated_meal["ingredients"]) == 2
        assert updated_meal["weight_grams"] == 400.0
        assert updated_meal["calories"] == new_total_cal
        assert updated_meal["is_manually_edited"] is True


@pytest.mark.asyncio
async def test_copy_meal_across_dates():
    """Tests duplicating / repeating a meal to a new date with custom time (FEAT-02)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"copy_meal_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Копирование Блюд"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Create original breakfast on Monday
        res_orig = await client.post(
            "/api/meals",
            json={
                "name": "Овсянка с протеином и ягодами",
                "calories": 420.0,
                "protein": 32.0,
                "fat": 8.0,
                "carbs": 55.0,
                "weight_grams": 350.0,
                "meal_date": "2026-10-12",
                "meal_time": "08:30:00",
                "ingredients": [
                    {"name": "Овсяные хлопья", "weight_grams": 60.0, "calories": 220.0, "protein": 8.0, "fat": 4.0, "carbs": 38.0},
                    {"name": "Сывороточный протеин", "weight_grams": 30.0, "calories": 120.0, "protein": 24.0, "fat": 1.5, "carbs": 2.0},
                    {"name": "Черника", "weight_grams": 50.0, "calories": 25.0, "protein": 0.5, "fat": 0.2, "carbs": 6.0},
                ],
            },
            headers=headers,
        )
        assert res_orig.status_code == 201
        orig_meal = res_orig.json()
        orig_id = orig_meal["id"]

        # Copy this breakfast to Tuesday with customized time
        copy_payload = {
            "target_date": "2026-10-13",
            "target_time": "09:15:00",
        }
        res_copy = await client.post(f"/api/meals/{orig_id}/copy", json=copy_payload, headers=headers)
        assert res_copy.status_code == 201
        cloned_meal = res_copy.json()

        # Assert clone properties
        assert cloned_meal["id"] != orig_id
        assert cloned_meal["meal_date"] == "2026-10-13"
        assert cloned_meal["meal_time"] == "09:15:00"
        assert cloned_meal["name"] == orig_meal["name"]
        assert cloned_meal["calories"] == orig_meal["calories"]
        assert len(cloned_meal["ingredients"]) == 3
        assert cloned_meal["ingredients"][0]["name"] == "Овсяные хлопья"

        # Verify that fetching Tuesday returns the cloned meal
        res_tue = await client.get("/api/meals?date=2026-10-13", headers=headers)
        assert res_tue.status_code == 200
        assert len(res_tue.json()["meals"]) == 1
        assert res_tue.json()["meals"][0]["id"] == cloned_meal["id"]


@pytest.mark.asyncio
async def test_meal_photo_deletion_and_refcount_safety(tmp_path):
    """Tests safe file deletion when meal is deleted, and ref-count preservation (B03, B04)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"photo_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Тест Фото"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Create dummy photo in uploads directory
        uploads_dir = Path(settings.UPLOAD_DIR)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        photo_filename = f"test_meal_photo_{ts}.jpg"
        photo_file = uploads_dir / photo_filename
        photo_file.write_bytes(b"dummy image bytes for test")
        assert photo_file.exists()

        relative_path = f"/uploads/{photo_filename}"

        # 1. Create two meals sharing the same photo (e.g. repeated or copied meal)
        m1 = await client.post(
            "/api/meals",
            json={
                "name": "Блюдо 1 с фото",
                "calories": 300.0,
                "protein": 20.0,
                "fat": 10.0,
                "carbs": 30.0,
                "weight_grams": 250.0,
                "meal_date": "2026-10-15",
                "meal_time": "12:00:00",
                "photo_path": relative_path,
            },
            headers=headers,
        )
        assert m1.status_code == 201
        m1_id = m1.json()["id"]

        m2 = await client.post(
            "/api/meals",
            json={
                "name": "Блюдо 2 с тем же фото",
                "calories": 300.0,
                "protein": 20.0,
                "fat": 10.0,
                "carbs": 30.0,
                "weight_grams": 250.0,
                "meal_date": "2026-10-15",
                "meal_time": "12:05:00",
                "photo_path": relative_path,
            },
            headers=headers,
        )
        assert m2.status_code == 201
        m2_id = m2.json()["id"]

        # 2. Delete Meal 1 -> File must NOT be deleted yet because Meal 2 still references it
        del1 = await client.delete(f"/api/meals/{m1_id}", headers=headers)
        assert del1.status_code == 204
        assert photo_file.exists(), "Photo file should still exist because meal 2 references it"

        # 3. Delete Meal 2 -> Now refcount drops to 0, so the file must be unlinked safely
        del2 = await client.delete(f"/api/meals/{m2_id}", headers=headers)
        assert del2.status_code == 204
        assert not photo_file.exists(), "Photo file should be removed after last referencing meal is deleted"


@pytest.mark.asyncio
async def test_meal_validation_edge_cases():
    """Tests rejection of invalid input data (negative calories, weights, bad formats)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"val_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Валидация"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # 1. Negative calories -> 422
        bad_cal = await client.post(
            "/api/meals",
            json={
                "name": "Негативная еда",
                "calories": -100.0,
                "protein": 10.0,
                "fat": 5.0,
                "carbs": 10.0,
                "weight_grams": 100.0,
            },
            headers=headers,
        )
        assert bad_cal.status_code == 422

        # 2. Negative weight -> 422
        bad_weight = await client.post(
            "/api/meals",
            json={
                "name": "Негативный вес",
                "calories": 100.0,
                "protein": 10.0,
                "fat": 5.0,
                "carbs": 10.0,
                "weight_grams": -50.0,
            },
            headers=headers,
        )
        assert bad_weight.status_code == 422

        # 3. Empty name -> 422
        bad_name = await client.post(
            "/api/meals",
            json={
                "name": "",
                "calories": 100.0,
                "protein": 10.0,
                "fat": 5.0,
                "carbs": 10.0,
                "weight_grams": 100.0,
            },
            headers=headers,
        )
        assert bad_name.status_code == 422
