import asyncio
from datetime import date
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.utils.ai_providers.base import _parse_float_safely, parse_food_result


async def test_edge_cases():
    print("=== STARTING QA CRITIC EDGE CASES INTEGRATION TEST ===")

    # 1. Test resilient numeric parsing in AI provider
    assert _parse_float_safely("350.5 ккал") == 350.5
    assert _parse_float_safely("~250г") == 250.0
    assert _parse_float_safely("0.0g") == 0.0
    assert _parse_float_safely(None, default=100.0) == 100.0
    parsed = parse_food_result({
        "name": "Гречка с курицей",
        "weight_grams": "300 г",
        "calories": "345 ккал",
        "protein": "38.5 г",
        "fat": "8.0 г",
        "carbs": "42 г",
        "confidence": "HIGH",
    })
    assert parsed.weight_grams == 300.0
    assert parsed.calories == 345.0
    assert parsed.protein == 38.5
    assert parsed.confidence == "high"
    print("[OK] 1. AI result resilient parsing passed.")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Register user
        import time
        email = f"qa_critic_{int(time.time())}@example.com"
        reg_res = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "SecurePassword123!", "name": "QA Tester"},
        )
        assert reg_res.status_code == 201
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        assert "refresh_token" in reg_data
        assert "token" in reg_data
        token = reg_data["access_token"]
        refresh_token = reg_data["refresh_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("[OK] 2. Auth register returned both flat access_token and nested token.")

        # 3. Refresh token without body, using Bearer header (frontend flow)
        ref_header_res = await client.post(
            "/api/auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ref_header_res.status_code == 200, f"Bearer refresh failed: {ref_header_res.text}"
        assert "access_token" in ref_header_res.json()
        print("[OK] 3. Bearer header refresh without JSON body succeeded.")

        # 4. Refresh token with body
        ref_body_res = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert ref_body_res.status_code == 200
        print("[OK] 4. Body refresh_token succeeded.")

        # 5. Profile calculate using frontend parameter names (current_weight_kg & target_weight_kg)
        calc_res = await client.post(
            "/api/profile/calculate",
            json={
                "height_cm": 180,
                "current_weight_kg": 85,
                "target_weight_kg": 75,
                "age": 28,
                "gender": "male",
                "activity_level": "moderate",
                "goal_type": "lose",
            },
            headers=headers,
        )
        assert calc_res.status_code == 200, f"Calculate goals failed: {calc_res.text}"
        calc_data = calc_res.json()
        assert calc_data["daily_calories_goal"] > 0
        assert calc_data["daily_protein_goal"] > 0
        print(f"[OK] 5. Frontend calculateGoals contract succeeded: {calc_data}")

        # 6. Log weight and retrieve using new GET /api/profile/weight
        log_res = await client.post(
            "/api/profile/weight",
            json={"weight_kg": 84.5},
            headers=headers,
        )
        assert log_res.status_code == 201
        get_weights_res = await client.get("/api/profile/weight", headers=headers)
        assert get_weights_res.status_code == 200
        weight_list = get_weights_res.json()
        assert len(weight_list) >= 1
        assert weight_list[0]["weight_kg"] == 84.5
        print(f"[OK] 6. GET /api/profile/weight succeeded with {len(weight_list)} logs.")

        # 7. Test Stats with period='today' (frontend sends 'today')
        today_stats_res = await client.get("/api/stats?period=today", headers=headers)
        assert today_stats_res.status_code == 200, f"Stats with today failed: {today_stats_res.text}"
        stats_data = today_stats_res.json()
        assert stats_data["period"] == "today"
        assert "days" in stats_data
        assert "daily_stats" in stats_data
        assert "avg_calories" in stats_data
        assert "average_calories" in stats_data
        assert len(stats_data["days"]) == 1
        print("[OK] 7. Stats period='today' and alias fields verified.")

    print("\n=== ALL QA CRITIC EDGE CASE TESTS PASSED SUCCESSFULLY! ===")


if __name__ == "__main__":
    asyncio.run(test_edge_cases())
