import os
import time
import json
import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, and_, text
from jose import jwt

from app.main import app
from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.user import User, WeightLog
from app.models.meal import Meal
from app.models.product import Product
from app.models.recipe import Recipe
from app.schemas.ai import FoodAnalysisResult, MealIngredientItem
from app.utils.ai_providers.base import parse_food_result
from app.utils.image import cleanup_orphan_uploads
from app.services.auth import create_token, create_access_token, create_refresh_token


@pytest.mark.asyncio
async def test_comprehensive_audit_b01_to_b14_and_features():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        u1_email = f"audit_u1_{ts}@test.com"
        u2_email = f"audit_u2_{ts}@test.com"

        # ------------------------------------------------------------------
        # Setup: Register Users
        # ------------------------------------------------------------------
        r1 = await client.post("/api/auth/register", json={"email": u1_email, "password": "Password123!", "name": "User 1"})
        assert r1.status_code == 201
        u1_data = r1.json()
        u1_token = u1_data["access_token"]
        u1_refresh = u1_data["refresh_token"]
        u1_id = u1_data["user"]["id"]
        h1 = {"Authorization": f"Bearer {u1_token}"}

        r2 = await client.post("/api/auth/register", json={"email": u2_email, "password": "Password123!", "name": "User 2"})
        assert r2.status_code == 201
        u2_data = r2.json()
        u2_token = u2_data["access_token"]
        u2_id = u2_data["user"]["id"]
        h2 = {"Authorization": f"Bearer {u2_token}"}

        # ------------------------------------------------------------------
        # BUG-B06: Token Type Enforcement & Refresh Security
        # ------------------------------------------------------------------
        # 1. Calling refresh with an access_token in Authorization header -> 401
        bad_refresh1 = await client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {u1_token}"})
        assert bad_refresh1.status_code == 401
        assert "Неверный тип токена" in bad_refresh1.json()["detail"]

        # 2. Calling refresh with access_token in request body -> 401
        bad_refresh2 = await client.post("/api/auth/refresh", json={"refresh_token": u1_token})
        assert bad_refresh2.status_code == 401

        # 3. Calling refresh with expired token -> 401
        expired_token = create_token(
            data={"sub": str(u1_id)},
            expires_delta=timedelta(seconds=-10),
            token_type="refresh",
        )
        bad_refresh3 = await client.post("/api/auth/refresh", json={"refresh_token": expired_token})
        assert bad_refresh3.status_code == 401
        assert "истёк" in bad_refresh3.json()["detail"]

        # 4. Valid refresh token works
        good_refresh = await client.post("/api/auth/refresh", json={"refresh_token": u1_refresh})
        assert good_refresh.status_code == 200
        new_tokens = good_refresh.json()
        assert "access_token" in new_tokens
        assert "refresh_token" in new_tokens

        # ------------------------------------------------------------------
        # BUG-B13: SQLite WAL Mode and Pragmas
        # ------------------------------------------------------------------
        async with AsyncSessionLocal() as session:
            res_wal = await session.execute(text("PRAGMA journal_mode"))
            mode = res_wal.scalar()
            assert str(mode).lower() == "wal"

            res_busy = await session.execute(text("PRAGMA busy_timeout"))
            timeout = res_busy.scalar()
            assert int(timeout) >= 5000

        # ------------------------------------------------------------------
        # BUG-B09: Custom product fields preservation
        # ------------------------------------------------------------------
        custom_barcode = f"460999{ts % 1000000:06d}"
        prod_res = await client.post(
            "/api/products",
            json={
                "name": "Протеиновый батончик",
                "calories_per_100g": 380.0,
                "protein_per_100g": 35.0,
                "fat_per_100g": 12.0,
                "carbs_per_100g": 25.0,
                "category": "Снеки",
                "barcode": custom_barcode,
                "brand": "Bombbar",
                "image_url": "/uploads/bombbar.jpg",
                "package_weight_grams": 60.0,
            },
            headers=h1,
        )
        assert prod_res.status_code == 201
        prod_data = prod_res.json()
        u1_prod_id = prod_data["id"]
        assert prod_data["barcode"] == custom_barcode
        assert prod_data["brand"] == "Bombbar"
        assert prod_data["image_url"] == "/uploads/bombbar.jpg"
        assert prod_data["package_weight_grams"] == 60.0

        # ------------------------------------------------------------------
        # BUG-B07: IDOR Protection in update_barcode_product
        # ------------------------------------------------------------------
        # 1. User 2 cannot edit User 1's custom product -> 403 Forbidden
        idor_res = await client.put(
            f"/api/barcode/product/{u1_prod_id}",
            json={"name": "Hacked", "calories_per_100g": 100.0, "protein_per_100g": 10.0, "fat_per_100g": 10.0, "carbs_per_100g": 10.0},
            headers=h2,
        )
        assert idor_res.status_code == 403

        # 2. User 1 CAN edit their own product -> 200 OK
        u1_edit_res = await client.put(
            f"/api/barcode/product/{u1_prod_id}",
            json={"name": "Bombbar Протеин", "calories_per_100g": 390.0, "protein_per_100g": 36.0, "fat_per_100g": 12.0, "carbs_per_100g": 25.0},
            headers=h1,
        )
        assert u1_edit_res.status_code == 200
        assert u1_edit_res.json()["name"] == "Bombbar Протеин"

        # 3. Base seed product without barcode cannot be edited -> 403 Forbidden
        async with AsyncSessionLocal() as session:
            seed_res = await session.execute(select(Product).where(and_(Product.is_custom.is_(False), Product.barcode.is_(None))).limit(1))
            seed_prod = seed_res.scalar_one_or_none()

        if seed_prod:
            seed_edit_res = await client.put(
                f"/api/barcode/product/{seed_prod.id}",
                json={"name": "Hacked Seed", "calories_per_100g": 50.0, "protein_per_100g": 5.0, "fat_per_100g": 5.0, "carbs_per_100g": 5.0},
                headers=h1,
            )
            assert seed_edit_res.status_code == 403

        # ------------------------------------------------------------------
        # BUG-B08: Recipe product scoping & isolation
        # ------------------------------------------------------------------
        # User 2 cannot use User 1's custom product in recipe
        recipe_fail = await client.post(
            "/api/recipes",
            json={"name": "Незаконный рецепт", "items": [{"product_id": u1_prod_id, "weight_grams": 60.0}]},
            headers=h2,
        )
        assert recipe_fail.status_code == 404

        # User 1 CAN use their own product
        recipe_ok = await client.post(
            "/api/recipes",
            json={"name": "Законный перекус", "items": [{"product_id": u1_prod_id, "weight_grams": 60.0}]},
            headers=h1,
        )
        assert recipe_ok.status_code == 201

        # ------------------------------------------------------------------
        # BUG-B14: Direct macro recipes & exclusion of 'Рецепты' from products search
        # ------------------------------------------------------------------
        direct_recipe_res = await client.post(
            "/api/recipes",
            json={
                "name": "Протеиновый шейк",
                "items": [],
                "total_calories": 280.0,
                "total_protein": 30.0,
                "total_fat": 4.0,
                "total_carbs": 12.0,
                "total_weight_grams": 350.0,
            },
            headers=h1,
        )
        assert direct_recipe_res.status_code == 201
        rec_data = direct_recipe_res.json()
        assert rec_data["total_calories"] == 280.0
        assert len(rec_data["items"]) == 0

        # General search must not include category "Рецепты"
        search_res = await client.get("/api/products", headers=h1)
        assert search_res.status_code == 200
        for p in search_res.json():
            assert p.get("category") != "Рецепты"

        # ------------------------------------------------------------------
        # FEAT-01: Multi-component meal creation, updating, and JSON ingredients
        # ------------------------------------------------------------------
        meal_res = await client.post(
            "/api/meals",
            json={
                "name": "Комплексный обед",
                "calories": 550.0,
                "protein": 40.0,
                "fat": 15.0,
                "carbs": 60.0,
                "weight_grams": 400.0,
                "user_comment": "Вкусный обед",
                "ingredients": [
                    {"name": "Рис басмати", "weight_grams": 150.0, "calories": 195.0, "protein": 4.0, "fat": 0.5, "carbs": 43.0},
                    {"name": "Куриное филе гриль", "weight_grams": 150.0, "calories": 240.0, "protein": 34.0, "fat": 5.0, "carbs": 0.0},
                    {"name": "Брокколи на пару", "weight_grams": 100.0, "calories": 35.0, "protein": 2.8, "fat": 0.4, "carbs": 7.0},
                ],
            },
            headers=h1,
        )
        assert meal_res.status_code == 201
        meal_data = meal_res.json()
        meal_id = meal_data["id"]
        assert len(meal_data["ingredients"]) == 3
        assert meal_data["ingredients"][0]["name"] == "Рис басмати"

        # ------------------------------------------------------------------
        # BUG-B10: Clear user_comment with None and update ingredients
        # ------------------------------------------------------------------
        update_meal_res = await client.put(
            f"/api/meals/{meal_id}",
            json={
                "user_comment": None,
                "ingredients": [
                    {"name": "Рис басмати", "weight_grams": 200.0, "calories": 260.0, "protein": 5.0, "fat": 1.0, "carbs": 57.0},
                ],
            },
            headers=h1,
        )
        assert update_meal_res.status_code == 200
        updated_data = update_meal_res.json()
        assert updated_data["user_comment"] is None
        assert len(updated_data["ingredients"]) == 1
        assert updated_data["ingredients"][0]["weight_grams"] == 200.0

        # Also test clearing ingredients completely with []
        clear_ing_res = await client.put(
            f"/api/meals/{meal_id}",
            json={"ingredients": []},
            headers=h1,
        )
        assert clear_ing_res.status_code == 200
        assert len(clear_ing_res.json()["ingredients"]) == 0

        # ------------------------------------------------------------------
        # BUG-B11: Recalculate resets is_manually_edited to False
        # ------------------------------------------------------------------
        mock_food_res = FoodAnalysisResult(
            name="Рис басмати пересчитанный",
            weight_grams=220.0,
            calories=285.0,
            protein=6.0,
            fat=1.0,
            carbs=62.0,
            confidence="high",
            raw_response='{"mock": true}',
            ingredients=[
                MealIngredientItem(name="Рис басмати", weight_grams=220.0, calories=285.0, protein=6.0, fat=1.0, carbs=62.0)
            ],
        )

        with patch("app.routers.meals.ai_router.recognize_food", new_callable=AsyncMock) as mock_ai_photo, \
             patch("app.routers.meals.ai_router.recognize_food_by_text", new_callable=AsyncMock) as mock_ai_text:
            mock_ai_photo.return_value = (mock_food_res, "mock_provider", "mock_model")
            mock_ai_text.return_value = (mock_food_res, "mock_provider", "mock_model")
            recalc_res = await client.post(
                f"/api/meals/{meal_id}/recalculate",
                json={"comment": "Увеличил порцию риса"},
                headers=h1,
            )
            assert recalc_res.status_code == 200
            recalc_data = recalc_res.json()
            assert recalc_data["is_manually_edited"] is False
            assert recalc_data["calories"] == 285.0
            assert len(recalc_data["ingredients"]) == 1

        # ------------------------------------------------------------------
        # FEAT-02: Copy meal to target date & time
        # ------------------------------------------------------------------
        target_d = (date.today() + timedelta(days=2)).isoformat()
        copy_res = await client.post(
            f"/api/meals/{meal_id}/copy",
            json={"target_date": target_d, "target_time": "14:30:00"},
            headers=h1,
        )
        assert copy_res.status_code == 201
        copied = copy_res.json()
        assert copied["id"] != meal_id
        assert copied["meal_date"] == target_d
        assert copied["meal_time"].startswith("14:30")
        assert len(copied["ingredients"]) == 1

        # User 2 cannot copy User 1's meal -> 404
        copy_hacked = await client.post(
            f"/api/meals/{meal_id}/copy",
            json={"target_date": target_d},
            headers=h2,
        )
        assert copy_hacked.status_code == 404

        # ------------------------------------------------------------------
        # BUG-B03 & BUG-B04: Path traversal & shared image deletion protection
        # ------------------------------------------------------------------
        upload_dir = settings.UPLOAD_DIR
        upload_dir.mkdir(parents=True, exist_ok=True)
        shared_filename = f"test_shared_{ts}.jpg"
        shared_file = upload_dir / shared_filename
        shared_file.write_bytes(b"dummy image bytes")

        shared_rel_path = f"/uploads/{shared_filename}"

        # Create Meal A with shared image
        res_ma = await client.post(
            "/api/meals",
            json={"name": "Meal A", "calories": 100, "protein": 5, "fat": 2, "carbs": 10, "photo_path": shared_rel_path},
            headers=h1,
        )
        ma_id = res_ma.json()["id"]

        # Create Meal B with same shared image
        res_mb = await client.post(
            "/api/meals",
            json={"name": "Meal B", "calories": 100, "protein": 5, "fat": 2, "carbs": 10, "photo_path": shared_rel_path},
            headers=h1,
        )
        mb_id = res_mb.json()["id"]

        # Also link a Product to the same image
        async with AsyncSessionLocal() as session:
            test_prod_img = Product(
                name="Product with shared image",
                calories_per_100g=100.0,
                protein_per_100g=5.0,
                fat_per_100g=2.0,
                carbs_per_100g=10.0,
                image_url=shared_rel_path,
                is_custom=True,
                created_by_user_id=u1_id,
            )
            session.add(test_prod_img)
            await session.commit()
            test_prod_img_id = test_prod_img.id

        # Delete Meal A -> image must NOT be unlinked
        await client.delete(f"/api/meals/{ma_id}", headers=h1)
        assert shared_file.exists(), "File should still exist because Meal B and Product reference it"

        # Delete Meal B -> image must NOT be unlinked
        await client.delete(f"/api/meals/{mb_id}", headers=h1)
        assert shared_file.exists(), "File should still exist because Product references it"

        # Clean up product and delete file
        async with AsyncSessionLocal() as session:
            p_to_del = await session.get(Product, test_prod_img_id)
            if p_to_del:
                await session.delete(p_to_del)
                await session.commit()
        if shared_file.exists():
            shared_file.unlink()

        # Path Traversal attack test on DELETE
        res_pt = await client.post(
            "/api/meals",
            json={"name": "Path Traversal Meal", "calories": 100, "protein": 5, "fat": 2, "carbs": 10, "photo_path": "/uploads/../main.py"},
            headers=h1,
        )
        pt_meal_id = res_pt.json()["id"]
        # Delete it: should not crash and should not touch main.py
        del_pt_res = await client.delete(f"/api/meals/{pt_meal_id}", headers=h1)
        assert Path("app/main.py").exists() or Path("backend/app/main.py").exists()

        # ------------------------------------------------------------------
        # BUG-B05: cleanup_orphan_uploads unit test
        # ------------------------------------------------------------------
        old_orphan = upload_dir / f"old_orphan_{ts}.jpg"
        old_orphan.write_bytes(b"old orphan")
        old_time = time.time() - (30 * 3600)  # 30 hours old
        os.utime(old_orphan, (old_time, old_time))

        new_orphan = upload_dir / f"new_orphan_{ts}.jpg"
        new_orphan.write_bytes(b"new orphan")  # freshly created

        async with AsyncSessionLocal() as session:
            cleaned_count = await cleanup_orphan_uploads(session, max_age_hours=24)
            assert cleaned_count >= 1

        assert not old_orphan.exists(), "30-hour old orphan should be deleted"
        assert new_orphan.exists(), "Fresh orphan should NOT be deleted"
        if new_orphan.exists():
            new_orphan.unlink()

        # ------------------------------------------------------------------
        # BUG-B12: Profile weight update rounding and target date logic
        # ------------------------------------------------------------------
        # 1. Rounding in update_profile
        prof_res = await client.put("/api/profile", json={"current_weight_kg": 83.456}, headers=h1)
        assert prof_res.status_code == 200
        assert prof_res.json()["current_weight_kg"] == 83.5

        # 2. Rounding in log_weight
        log_res = await client.post("/api/profile/weight", json={"weight_kg": 83.678}, headers=h1)
        assert log_res.status_code == 201
        assert log_res.json()["weight_kg"] == 83.7

        # 3. Log past date when today's log already exists: does NOT overwrite current_weight_kg
        yesterday_str = (date.today() - timedelta(days=1)).isoformat()
        past_log_res = await client.post(
            "/api/profile/weight",
            json={"weight_kg": 70.0, "log_date": yesterday_str},
            headers=h1,
        )
        assert past_log_res.status_code == 201

        # Check current weight remains 83.7 (not overwritten by past date)
        get_prof = await client.get("/api/profile", headers=h1)
        assert get_prof.json()["current_weight_kg"] == 83.7

        # ------------------------------------------------------------------
        # FEAT-01: AI Result ingredients discrepancy consistency recalculation
        # ------------------------------------------------------------------
        # Discrepancy > 15%: components sum is 300 kcal, but total is 100 kcal -> should recalculate to 300
        parsed_discrepancy = parse_food_result({
            "name": "Тестовое блюдо",
            "weight_grams": 200,
            "calories": 100,  # wrong low total
            "protein": 5,
            "fat": 2,
            "carbs": 15,
            "confidence": "high",
            "ingredients": [
                {"name": "Компонент 1", "weight_grams": 100, "calories": 150, "protein": 15, "fat": 5, "carbs": 10},
                {"name": "Компонент 2", "weight_grams": 100, "calories": 150, "protein": 15, "fat": 5, "carbs": 10},
            ],
        })
        assert parsed_discrepancy.calories == 300.0
        assert parsed_discrepancy.protein == 30.0

        # Corrupted JSON handling in Meal.ingredients
        test_meal_obj = Meal(
            user_id=u1_id,
            name="Corrupted test",
            calories=100,
            protein=5,
            fat=2,
            carbs=10,
            meal_date=date.today(),
            meal_time=datetime.now().time(),
        )
        test_meal_obj.ingredients_json = "invalid json {["
        assert test_meal_obj.ingredients == []

        test_meal_obj.ingredients_json = '{"not": "a list"}'
        assert test_meal_obj.ingredients == []

        test_meal_obj.ingredients = [{"name": "Valid", "weight_grams": 50, "calories": 50, "protein": 2, "fat": 1, "carbs": 5}]
        assert isinstance(test_meal_obj.ingredients, list)
        assert len(test_meal_obj.ingredients) == 1
        assert test_meal_obj.ingredients[0]["name"] == "Valid"

        # Clean up test meals
        await client.delete(f"/api/meals/{meal_id}", headers=h1)
        await client.delete(f"/api/meals/{copied['id']}", headers=h1)
