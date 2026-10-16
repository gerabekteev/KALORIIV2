import time
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.auth import create_token
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select


@pytest.mark.asyncio
async def test_user_registration_and_validation():
    """Tests user registration validation, duplicate email handling, and initial setup."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        valid_email = f"user_reg_{ts}@example.com"

        # 1. Successful registration
        res1 = await client.post(
            "/api/auth/register",
            json={
                "email": valid_email,
                "password": "StrongPassword123!",
                "name": "Алексей Смирнов",
            },
        )
        assert res1.status_code == 201, f"Registration failed: {res1.text}"
        data1 = res1.json()
        assert data1["user"]["email"] == valid_email
        assert data1["user"]["name"] == "Алексей Смирнов"
        assert "access_token" in data1
        assert "refresh_token" in data1

        # 2. Duplicate registration attempt -> 400
        res_dup = await client.post(
            "/api/auth/register",
            json={
                "email": valid_email,
                "password": "AnotherPassword456!",
                "name": "Алексей Клон",
            },
        )
        assert res_dup.status_code == 400
        assert "уже зарегистрирован" in res_dup.json()["detail"].lower()

        # 3. Invalid email / empty fields -> 422
        res_invalid = await client.post(
            "/api/auth/register",
            json={"email": "not-an-email", "password": "123"},
        )
        assert res_invalid.status_code == 422


@pytest.mark.asyncio
async def test_auth_login_refresh_and_token_revocation():
    """Tests login, refresh flow, token type restrictions, and token_version revocation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"user_auth_{ts}@example.com"
        password = "SecretPassword123!"

        # Register
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "name": "Иван"},
        )
        assert reg.status_code == 201
        reg_tokens = reg.json()
        old_access_token = reg_tokens["access_token"]
        old_refresh_token = reg_tokens["refresh_token"]
        user_id = reg_tokens["user"]["id"]

        # 1. Login with correct password
        login_ok = await client.post("/api/auth/login", json={"email": email, "password": password})
        assert login_ok.status_code == 200
        login_data = login_ok.json()
        assert "access_token" in login_data

        # 2. Login with wrong password -> 401
        login_bad = await client.post("/api/auth/login", json={"email": email, "password": "WrongPassword!"})
        assert login_bad.status_code == 401

        # 3. Refresh with valid refresh_token
        ref_ok = await client.post("/api/auth/refresh", json={"refresh_token": old_refresh_token})
        assert ref_ok.status_code == 200
        ref_data = ref_ok.json()
        assert "access_token" in ref_data
        assert "refresh_token" in ref_data
        new_access = ref_data["access_token"]

        # 4. Authenticated request using new access token
        me_res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
        assert me_res.status_code == 200
        assert me_res.json()["id"] == user_id

        # 5. Invalidate sessions by incrementing token_version in database (simulates password reset / logout all)
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            assert user is not None
            user.token_version += 1
            await session.commit()

        # 6. Now previous tokens must be rejected because token_version changed
        revoked_check = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
        assert revoked_check.status_code == 401
        assert "отозван" in revoked_check.json()["detail"].lower() or "недействителен" in revoked_check.json()["detail"].lower()


@pytest.mark.asyncio
async def test_mifflin_st_jeor_calculation_and_profile_updating():
    """Tests Mifflin-St Jeor target calculation for various user goals and profiles."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"calc_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Ольга"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Male, moderate activity, lose weight
        calc1 = await client.post(
            "/api/profile/calculate",
            json={
                "height_cm": 180,
                "weight_kg": 90,
                "age": 30,
                "gender": "male",
                "activity_level": "moderate",
                "goal": "lose_weight",
            },
            headers=headers,
        )
        assert calc1.status_code == 200
        data1 = calc1.json()
        assert data1["daily_calories_goal"] > 1500
        assert data1["daily_protein_goal"] > 100
        assert data1["daily_fat_goal"] > 40
        assert data1["daily_carbs_goal"] > 100

        # 2. Female, sedentary activity, maintain weight
        calc2 = await client.post(
            "/api/profile/calculate",
            json={
                "height_cm": 165,
                "weight_kg": 60,
                "age": 28,
                "gender": "female",
                "activity_level": "sedentary",
                "goal": "maintain",
            },
            headers=headers,
        )
        assert calc2.status_code == 200
        data2 = calc2.json()
        assert data2["daily_calories_goal"] < data1["daily_calories_goal"]

        # 3. Save profile with calculated goals and custom timezone
        profile_update = {
            "height_cm": 165,
            "current_weight_kg": 60.5,
            "target_weight_kg": 57.0,
            "age": 28,
            "gender": "female",
            "activity_level": "sedentary",
            "daily_calories_goal": data2["daily_calories_goal"],
            "daily_protein_goal": data2["daily_protein_goal"],
            "daily_fat_goal": data2["daily_fat_goal"],
            "daily_carbs_goal": data2["daily_carbs_goal"],
            "timezone": "Europe/Moscow",
        }
        update_res = await client.put("/api/profile", json=profile_update, headers=headers)
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["timezone"] == "Europe/Moscow"
        assert updated["daily_calories_goal"] == data2["daily_calories_goal"]
        assert updated["current_weight_kg"] == 60.5


@pytest.mark.asyncio
async def test_user_weight_tracking_history():
    """Tests logging user weight history and retrieving trend logs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"weight_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Михаил"},
        )
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Log three consecutive weights
        w1 = await client.post("/api/profile/weight", json={"weight_kg": 85.0}, headers=headers)
        assert w1.status_code == 201
        w2 = await client.post("/api/profile/weight", json={"weight_kg": 84.6}, headers=headers)
        assert w2.status_code == 201
        w3 = await client.post("/api/profile/weight", json={"weight_kg": 84.1}, headers=headers)
        assert w3.status_code == 201

        # Fetch weight stats
        stats_res = await client.get("/api/stats/weight", headers=headers)
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert "history" in stats or "weight_logs" in stats or isinstance(stats, list) or "current_weight" in stats
