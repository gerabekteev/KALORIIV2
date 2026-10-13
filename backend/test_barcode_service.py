import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.barcode_service import parse_and_normalize_barcode, parse_weight_grams_from_text


def test_barcode_normalization():
    # Standard EAN-13
    code, is_honest = parse_and_normalize_barcode("4607025140019")
    assert code == "4607025140019"
    assert not is_honest

    # Russian Chestny ZNAK DataMatrix with leading 01 and 14-digit GTIN starting with 0
    raw_cz = "0104601234567890215abcde91ffd092c"
    code, is_honest = parse_and_normalize_barcode(raw_cz)
    assert code == "4601234567890"
    assert is_honest is True

    # Chestny ZNAK with GS1 AI brackets
    raw_brackets = "(01)04607025140019(21)5x9q(91)ffd0"
    code, is_honest = parse_and_normalize_barcode(raw_brackets)
    assert code == "4607025140019"
    assert is_honest is True

    # Weight parsing
    assert parse_weight_grams_from_text("200 g") == 200.0
    assert parse_weight_grams_from_text("180 г") == 180.0
    assert parse_weight_grams_from_text("1 кг") == 1000.0
    assert parse_weight_grams_from_text("0.5 л") == 500.0
    assert parse_weight_grams_from_text("330 ml") == 330.0
    assert parse_weight_grams_from_text(None) == 100.0


@pytest.mark.asyncio
async def test_barcode_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Register test user
        import time
        email = f"barcode_test_{int(time.time())}@example.com"
        reg_res = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Тестер Штрихкодов"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["token"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Lookup existing product or live Coca-Cola test
        lookup_res = await client.post(
            "/api/barcode/lookup",
            json={"barcode": "5449000000996"},
            headers=headers,
        )
        # Should either succeed from OFF or return 404 if OFF network blocked
        assert lookup_res.status_code in (200, 404)
        if lookup_res.status_code == 200:
            data = lookup_res.json()
            assert "name" in data
            assert data["calories_per_100g"] >= 0
            assert "image_url" in data

            # 3. Check recent shelf
            recent_res = await client.get("/api/barcode/recent", headers=headers)
            assert recent_res.status_code == 200
            recent_items = recent_res.json()
            assert len(recent_items) >= 1
            assert recent_items[0]["product_id"] == data["product_id"]

            # 4. Delete from recent shelf
            del_res = await client.delete(
                f"/api/barcode/recent/{data['product_id']}",
                headers=headers,
            )
            assert del_res.status_code == 204

            # Verify it's removed
            recent_after = await client.get("/api/barcode/recent", headers=headers)
            assert len(recent_after.json()) == 0

        # 5. Non-existent barcode returns 404
        fail_res = await client.post(
            "/api/barcode/lookup",
            json={"barcode": "0000000000000"},
            headers=headers,
        )
        assert fail_res.status_code == 404
