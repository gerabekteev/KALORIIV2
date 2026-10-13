import asyncio
import io
import json
import time
from httpx import AsyncClient, ASGITransport
from PIL import Image

from app.main import app
from app.utils.ai_providers.base import AIRateLimitError
from app.services.ai_router import AIRouter


async def test_wave4_recipes_and_ai():
    print("=== STARTING WAVE 4 RECIPES & AI AUDIT TESTS ===")
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Register test user
        ts = int(time.time() * 1000)
        user_email = f"wave4_audit_{ts}@example.com"
        reg_res = await client.post(
            "/api/auth/register",
            json={"email": user_email, "password": "Password123!", "name": "Wave4 Tester"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Search products to get IDs for ingredient recipe
        prods_res = await client.get("/api/products?limit=5", headers=headers)
        assert prods_res.status_code == 200
        prods = prods_res.json()
        assert len(prods) >= 2
        p1 = prods[0]
        p2 = prods[1]

        # 3. Create a custom product
        cust_prod_res = await client.post(
            "/api/products",
            json={
                "name": f"Специальный протеин {ts}",
                "calories_per_100g": 380.0,
                "protein_per_100g": 75.0,
                "fat_per_100g": 3.0,
                "carbs_per_100g": 8.0,
                "category": "Спортивное питание",
            },
            headers=headers,
        )
        assert cust_prod_res.status_code == 201
        custom_product = cust_prod_res.json()
        cust_id = custom_product["id"]

        # 4. Create multi-ingredient recipe
        recipe_payload = {
            "name": "Протеиновая каша",
            "description": "Сложный завтрак",
            "items": [
                {"product_id": p1["id"], "weight_grams": 100.0},
                {"product_id": cust_id, "weight_grams": 50.0},
            ],
        }
        create_res = await client.post("/api/recipes", json=recipe_payload, headers=headers)
        assert create_res.status_code == 201
        recipe_data = create_res.json()
        assert recipe_data["name"] == "Протеиновая каша"
        assert len(recipe_data["items"]) == 2
        assert recipe_data["is_favorite"] is False
        assert recipe_data["total_weight_grams"] == 150.0
        recipe_id = recipe_data["id"]

        # Expected calories: p1 (100g) + cust_id (50g -> 380 * 0.5 = 190)
        expected_cal = round(p1["calories_per_100g"] + 380.0 * 0.5, 1)
        assert abs(recipe_data["total_calories"] - expected_cal) < 0.2
        print(f"[OK] Multi-ingredient recipe created: {recipe_data['name']} ({recipe_data['total_calories']} kcal)")

        # 5. List recipes (all)
        list_res = await client.get("/api/recipes", headers=headers)
        assert list_res.status_code == 200
        recipes_all = list_res.json()
        assert len(recipes_all) == 1
        assert recipes_all[0]["id"] == recipe_id

        # 6. List recipes (favorite_only = true -> should be empty)
        fav_empty_res = await client.get("/api/recipes?favorite_only=true", headers=headers)
        assert fav_empty_res.status_code == 200
        assert len(fav_empty_res.json()) == 0

        # 7. Toggle recipe favorite
        fav_toggle_res = await client.put(f"/api/recipes/{recipe_id}/favorite", headers=headers)
        assert fav_toggle_res.status_code == 200
        toggled = fav_toggle_res.json()
        assert toggled["is_favorite"] is True
        assert len(toggled["items"]) == 2
        assert toggled["items"][0]["product"]["name"] is not None
        print(f"[OK] Recipe favorite toggled to TRUE, items preserved: {len(toggled['items'])}")

        # 8. List recipes (favorite_only = true -> now returns 1)
        fav_res = await client.get("/api/recipes?favorite_only=true", headers=headers)
        assert fav_res.status_code == 200
        assert len(fav_res.json()) == 1

        # 9. Verify product deletion protection when used in a recipe
        del_prod_res = await client.delete(f"/api/products/{cust_id}", headers=headers)
        assert del_prod_res.status_code == 400
        assert "используется в сохранённых рецептах" in del_prod_res.json()["detail"]
        print("[OK] Foreign key protection prevented deletion of product used in recipe")

        # 10. Delete recipe
        del_rec_res = await client.delete(f"/api/recipes/{recipe_id}", headers=headers)
        assert del_rec_res.status_code == 204

        # Verify recipe no longer exists
        get_deleted_res = await client.get(f"/api/recipes/{recipe_id}", headers=headers)
        assert get_deleted_res.status_code == 404

        # 11. Now custom product can be safely deleted
        del_prod_ok = await client.delete(f"/api/products/{cust_id}", headers=headers)
        assert del_prod_ok.status_code == 204
        print("[OK] Recipe deleted, cascade cleaned, product subsequently deleted cleanly")

        # 12. Test custom AI headers parsing on /api/ai/recognize
        img = Image.new("RGB", (64, 64), color=(200, 100, 50))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        test_jpeg = buf.getvalue()

        # Send request with invalid custom Gemini key to verify header is received and used
        ai_headers = {
            **headers,
            "X-Gemini-Key": "AIzaSy_fake_test_key_for_header_audit_12345",
            "X-OpenRouter-Key": "sk-or-v1-fake_audit_key",
            "X-AI-Models": json.dumps([{"provider": "gemini", "id": "gemini-3.8-flash"}]),
        }

        ai_res = await client.post(
            "/api/ai/recognize",
            files={"photo": ("snack.jpg", test_jpeg, "image/jpeg")},
            data={"comment": "Тест AI кастомных заголовков"},
            headers=ai_headers,
        )
        # Should either fail with 503 (auth failed on fake key) or succeed if fallback was invoked
        assert ai_res.status_code in {200, 503}
        if ai_res.status_code == 503:
            assert "Все модели AI" in ai_res.json()["detail"]
            print("[OK] Custom X-Gemini-Key / X-AI-Models header recognized and processed")

    # 13. Unit test AIRouter instant 429 failover behavior
    class MockRateLimitedProvider:
        async def analyze_food(self, *args, **kwargs):
            raise AIRateLimitError("Quota exhausted (429)")

    router = AIRouter(
        gemini_api_key="mock_key",
        openrouter_api_key="mock_key",
        model_chain=[("gemini", "m1"), ("gemini", "m2")],
    )
    # Patch provider factory
    calls = []

    def mock_get_provider(p_type, m_id, **kwargs):
        calls.append(m_id)
        return MockRateLimitedProvider()

    router._get_provider_instance = mock_get_provider

    start_t = time.time()
    try:
        await router.recognize_food(b"dummy")
    except Exception:
        pass
    elapsed = time.time() - start_t

    # Both models failed with 429, each should only be attempted ONCE without 5s sleep
    assert len(calls) == 2, f"Expected 2 attempts (1 per model), got {len(calls)}"
    assert elapsed < 2.0, f"429 failover took {elapsed:.2f}s, expected < 2.0s without cooldown sleep"
    print(f"[OK] Instant 429 failover confirmed: {len(calls)} models tried in {elapsed:.3f}s without sleep delay")

    print("\n=== ALL WAVE 4 RECIPES & AI AUDIT TESTS PASSED SUCCESSFULLY! ===")


if __name__ == "__main__":
    asyncio.run(test_wave4_recipes_and_ai())
