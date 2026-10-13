import asyncio
import io
from datetime import date
from PIL import Image
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.models.product import Product
from sqlalchemy import select, func


async def test_full_backend():
    print("=== STARTING FULL BACKEND INTEGRATION TEST ===")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Health check
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("[OK] 1. Health check passed:", res.json())

        # 2. Check product seed
        async with AsyncSessionLocal() as session:
            count = (await session.execute(select(func.count(Product.id)))).scalar_one()
            print(f"[OK] 2. Products table count in database: {count}")
            assert count >= 50, f"Expected at least 50 seeded products, got {count}"

        # 3. User Registration
        import time
        test_email = f"bektemir_test_{int(time.time())}@example.com"
        test_pass = "SecurePass123!"
        reg_payload = {
            "email": test_email,
            "password": test_pass,
            "name": "Бектемир",
        }
        res = await client.post("/api/auth/register", json=reg_payload)
        assert res.status_code == 201, f"Registration failed: {res.text}"
        reg_data = res.json()
        token = reg_data["token"]["access_token"]
        refresh_token = reg_data["token"]["refresh_token"]
        user_id = reg_data["user"]["id"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"[OK] 3. Registration passed. User ID: {user_id}")

        # 4. User Login
        res = await client.post("/api/auth/login", json={"email": test_email, "password": test_pass})
        assert res.status_code == 200, f"Login failed: {res.text}"
        print("[OK] 4. Login passed.")

        # 5. Token Refresh
        res = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert res.status_code == 200, f"Refresh failed: {res.text}"
        new_token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {new_token}"}
        print("[OK] 5. Token refresh passed.")

        # 6. Get Current User / Profile
        res = await client.get("/api/auth/me", headers=headers)
        assert res.status_code == 200, f"Get me failed: {res.text}"
        print("[OK] 6. /api/auth/me passed.")

        # 7. Calculate KBJU (Mifflin-St Jeor)
        calc_payload = {
            "height_cm": 175,
            "weight_kg": 80,
            "age": 25,
            "gender": "male",
            "activity_level": "moderate",
            "goal": "lose_weight",
        }
        res = await client.post("/api/profile/calculate", json=calc_payload, headers=headers)
        assert res.status_code == 200, f"Calculate failed: {res.text}"
        calc_res = res.json()
        print(f"[OK] 7. Mifflin-St Jeor calculation passed: {calc_res}")

        # 8. Update Profile with goals
        update_profile_payload = {
            "height_cm": 175,
            "current_weight_kg": 80,
            "target_weight_kg": 72,
            "age": 25,
            "gender": "male",
            "activity_level": "moderate",
            "daily_calories_goal": calc_res["daily_calories_goal"],
            "daily_protein_goal": calc_res["daily_protein_goal"],
            "daily_fat_goal": calc_res["daily_fat_goal"],
            "daily_carbs_goal": calc_res["daily_carbs_goal"],
        }
        res = await client.put("/api/profile", json=update_profile_payload, headers=headers)
        assert res.status_code == 200, f"Update profile failed: {res.text}"
        print("[OK] 8. Profile updated with calculated goals.")

        # 9. Log Weight
        res = await client.post("/api/profile/weight", json={"weight_kg": 79.5}, headers=headers)
        assert res.status_code == 201, f"Log weight failed: {res.text}"
        print("[OK] 9. Weight log entry added.")

        # 10. Weight stats
        res = await client.get("/api/stats/weight", headers=headers)
        assert res.status_code == 200, f"Weight stats failed: {res.text}"
        print("[OK] 10. Weight stats retrieved:", res.json())

        # 11. Search Products
        res = await client.get("/api/products?search=греч", headers=headers)
        assert res.status_code == 200, f"Search products failed: {res.text}"
        products_found = res.json()
        assert len(products_found) > 0, "Expected to find buckwheat in seed products"
        grechka_id = products_found[0]["id"]
        print(f"[OK] 11. Search products found: {products_found[0]['name']} (ID {grechka_id})")

        # 12. Create Custom Product
        res = await client.post(
            "/api/products",
            json={
                "name": "Протеиновый батончик Bombbar",
                "calories_per_100g": 315.0,
                "protein_per_100g": 33.3,
                "fat_per_100g": 9.5,
                "carbs_per_100g": 6.8,
                "category": "Спортивное питание",
            },
            headers=headers,
        )
        assert res.status_code == 201, f"Create custom product failed: {res.text}"
        custom_prod_id = res.json()["id"]
        print(f"[OK] 12. Custom product created with ID: {custom_prod_id}")

        # 13. Create Recipe
        recipe_payload = {
            "name": "Завтрак чемпиона",
            "description": "Гречка и протеиновый перекус",
            "items": [
                {"product_id": grechka_id, "weight_grams": 200},
                {"product_id": custom_prod_id, "weight_grams": 60},
            ],
        }
        res = await client.post("/api/recipes", json=recipe_payload, headers=headers)
        assert res.status_code == 201, f"Create recipe failed: {res.text}"
        recipe_data = res.json()
        recipe_id = recipe_data["id"]
        print(f"[OK] 13. Recipe created: {recipe_data['name']}, total calories: {recipe_data['total_calories']}")

        # 14. Toggle Recipe Favorite
        res = await client.put(f"/api/recipes/{recipe_id}/favorite", headers=headers)
        assert res.status_code == 200 and res.json()["is_favorite"] is True
        print("[OK] 14. Recipe toggled to favorite.")

        # 15. Create Meal
        today_str = date.today().isoformat()
        meal_payload = {
            "name": "Овсянка с бананом",
            "calories": 320.0,
            "protein": 12.0,
            "fat": 8.0,
            "carbs": 52.0,
            "weight_grams": 250.0,
            "user_comment": "Вкусный завтрак",
            "meal_date": today_str,
            "meal_time": "09:30:00",
        }
        res = await client.post("/api/meals", json=meal_payload, headers=headers)
        assert res.status_code == 201, f"Create meal failed: {res.text}"
        meal_id = res.json()["id"]
        print(f"[OK] 15. Meal created with ID: {meal_id}")

        # 16. Get Meals for Today
        res = await client.get(f"/api/meals?date={today_str}", headers=headers)
        assert res.status_code == 200, f"Get meals failed: {res.text}"
        daily_summary = res.json()
        assert len(daily_summary["meals"]) == 1
        assert daily_summary["total_calories"] == 320.0
        print(f"[OK] 16. Daily meals summary passed: {daily_summary['total_calories']} kcal consumed.")

        # 17. Update Meal
        res = await client.put(
            f"/api/meals/{meal_id}",
            json={"name": "Овсянка с бананом и мёдом", "calories": 350.0},
            headers=headers,
        )
        assert res.status_code == 200 and res.json()["calories"] == 350.0
        print("[OK] 17. Meal updated.")

        # 18. Stats Period
        res = await client.get("/api/stats?period=week", headers=headers)
        assert res.status_code == 200, f"Stats failed: {res.text}"
        stats_data = res.json()
        assert stats_data["period"] == "week"
        assert len(stats_data["daily_stats"]) == 7
        print(f"[OK] 18. Weekly statistics passed: {stats_data['tracked_days']} tracked day(s).")

        # 19. AI Recognize (rate limit and validation test)
        # Create a dummy JPEG in memory
        img = Image.new("RGB", (200, 200), color=(255, 128, 0))
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="JPEG")
        dummy_jpeg = img_byte_arr.getvalue()

        # Test invalid file format error
        res = await client.post(
            "/api/ai/recognize",
            files={"photo": ("test.txt", b"plain text", "text/plain")},
            headers=headers,
        )
        assert res.status_code == 400
        print(f"[OK] 19. AI endpoint MIME type validation passed: {res.json()['detail']}")

        # Test upload of valid photo
        res = await client.post(
            "/api/ai/recognize",
            files={"photo": ("food.jpg", dummy_jpeg, "image/jpeg")},
            data={"comment": "Тестовое блюдо"},
            headers=headers,
        )
        if res.status_code == 200:
            ai_data = res.json()
            print(f"[OK] 20. AI router successful recognition: '{ai_data['name']}' ({ai_data['calories']} kcal, {ai_data['protein']}g protein) using {ai_data['provider_used']}/{ai_data['model_used']}")
        else:
            assert res.status_code == 503
            assert "Все модели AI" in res.json()["detail"]
            print("[OK] 20. AI router fallback and graceful degradation verified:", res.json()["detail"])

        # 21. SPA Frontend static serving
        res = await client.get("/")
        assert res.status_code == 200
        assert "text/html" in res.headers.get("content-type", "")
        print("[OK] 21. SPA Root index.html serving verified.")

        res = await client.get("/profile")
        assert res.status_code == 200
        assert "text/html" in res.headers.get("content-type", "")
        print("[OK] 22. SPA Client-side route fallback (/profile -> index.html) verified.")

        print("\n=== ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS! ===")


if __name__ == "__main__":
    asyncio.run(test_full_backend())
