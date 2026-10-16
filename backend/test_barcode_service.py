import time
import pytest
from unittest.mock import patch, MagicMock
import httpx
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.barcode_service import (
    parse_and_normalize_barcode,
    parse_weight_grams_from_text,
    fetch_from_open_food_facts,
    _safe_float,
)
from app.routers.ai import _rate_limit_records, cleanup_stale_rate_limit_records, _sanitize_api_key, _parse_custom_ai_models


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


def test_barcode_normalization_advanced_edge_cases():
    """Verify GS1 DataMatrix edge cases: separators, brackets, prefixes, quotes, SQLi."""
    # 1. Separator \x1d (ASCII 29 GS)
    code, is_honest = parse_and_normalize_barcode("\x1d0104601234567890215abcde\x1d91ffd0\x1d92c")
    assert code == "4601234567890"
    assert is_honest is True

    # 2. ISO/IEC 15424 Symbology Identifiers (]d2 for DataMatrix, ]C1 for GS1-128)
    code, is_honest = parse_and_normalize_barcode("]d20104601234567890215abcde")
    assert code == "4601234567890"
    assert is_honest is True

    code, is_honest = parse_and_normalize_barcode("]C1(01)04601234567890(21)5abcde")
    assert code == "4601234567890"
    assert is_honest is True

    # 3. Textual tags <GS>, [GS], <FNC1>, [FNC1]
    for tag in ("<GS>", "[GS]", "<FNC1>", "[FNC1]"):
        code, is_honest = parse_and_normalize_barcode(f"{tag}0104601234567890215abcde")
        assert code == "4601234567890"
        assert is_honest is True

    # 4. Quotes, backticks, leading/trailing spaces
    code, is_honest = parse_and_normalize_barcode("  '0104601234567890215abcde'  ")
    assert code == "4601234567890"
    assert is_honest is True

    code, is_honest = parse_and_normalize_barcode('  "4607025140019"  ')
    assert code == "4607025140019"
    assert is_honest is False

    # 5. Spaces inside GS1 string
    code, is_honest = parse_and_normalize_barcode("01 04601234567890 21 5abcde")
    assert code == "4601234567890"
    assert is_honest is True

    code, is_honest = parse_and_normalize_barcode("460 702 514 0019")
    assert code == "4607025140019"
    assert is_honest is False

    # 6. 14-digit GTIN without '01' prefix
    code, is_honest = parse_and_normalize_barcode("04601234567890")
    assert code == "4601234567890"
    assert is_honest is True

    code, is_honest = parse_and_normalize_barcode("14601234567897")
    assert code == "14601234567897"
    assert is_honest is True

    # 7. Null bytes stripped safely
    code, is_honest = parse_and_normalize_barcode("\x00010460123456789021abc\x00")
    assert code == "4601234567890"
    assert is_honest is True

    # 8. SQL injection strings handled without exceptions
    code, is_honest = parse_and_normalize_barcode("' OR '1'='1")
    assert code != ""
    assert is_honest is False

    # 9. Empty and None inputs
    assert parse_and_normalize_barcode("") == ("", False)
    assert parse_and_normalize_barcode("   ") == ("", False)
    assert parse_and_normalize_barcode(None) == ("", False)


def test_safe_float_and_key_sanitizer():
    """Verify robust numeric conversion and API key sanitization."""
    assert _safe_float("14.5") == 14.5
    assert _safe_float("14,5") == 14.5
    assert _safe_float(" 120 ") == 120.0
    assert _safe_float("N/A", default=0.0) == 0.0
    assert _safe_float(None, default=5.0) == 5.0

    # API key sanitizer
    assert _sanitize_api_key(None) is None
    assert _sanitize_api_key("") is None
    assert _sanitize_api_key("   ") is None
    assert _sanitize_api_key("null") is None
    assert _sanitize_api_key("undefined") is None
    assert _sanitize_api_key("none") is None
    assert _sanitize_api_key("short") is None  # < 8 chars
    assert _sanitize_api_key("AIzaSyDummyValidApiKey12345") == "AIzaSyDummyValidApiKey12345"
    assert _sanitize_api_key("  'sk-or-v1-abcdef123456'  ") == "sk-or-v1-abcdef123456"

    # Custom model parser
    assert _parse_custom_ai_models(None) is None
    assert _parse_custom_ai_models("invalid json") is None
    parsed_chain = _parse_custom_ai_models('[{"provider": "gemini", "id": "gemini-2.0-flash", "enabled": true}, {"provider": "openrouter", "id": "openrouter-free", "enabled": false}]')
    assert parsed_chain == [("gemini", "gemini-2.0-flash")]


@pytest.mark.asyncio
async def test_open_food_facts_error_resilience():
    """Test Open Food Facts resilience under timeout, 5xx, and invalid JSON."""
    # Test invalid barcode format rejected early without network call
    res = await fetch_from_open_food_facts("bad/barcode?query=1")
    assert res is None

    # Mock timeout
    with patch("httpx.AsyncClient.get", side_effect=httpx.TimeoutException("Connection timed out")):
        res = await fetch_from_open_food_facts("4607025140019")
        assert res is None

    # Mock 502 Bad Gateway
    mock_resp = MagicMock()
    mock_resp.status_code = 502
    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        res = await fetch_from_open_food_facts("4607025140019")
        assert res is None

    # Mock non-JSON response
    mock_resp.status_code = 200
    mock_resp.json.side_effect = ValueError("Invalid JSON")
    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        res = await fetch_from_open_food_facts("4607025140019")
        assert res is None


@pytest.mark.asyncio
async def test_recent_scans_user_isolation():
    """Verify that DELETE /api/barcode/recent/{product_id} is properly isolated to current user."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time())
        # User 1
        u1_res = await client.post(
            "/api/auth/register",
            json={"email": f"u1_isolation_{ts}@example.com", "password": "Password123!", "name": "User 1"},
        )
        assert u1_res.status_code == 201
        token1 = u1_res.json()["token"]["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # User 2
        u2_res = await client.post(
            "/api/auth/register",
            json={"email": f"u2_isolation_{ts}@example.com", "password": "Password123!", "name": "User 2"},
        )
        assert u2_res.status_code == 201
        token2 = u2_res.json()["token"]["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Create product in DB
        from app.database import AsyncSessionLocal
        from app.models.product import Product
        from app.services.barcode_service import record_user_scan

        async with AsyncSessionLocal() as session:
            prod = Product(
                name="Изолированный Продукт",
                barcode=f"460111{ts % 1000000:06d}",
                calories_per_100g=210.0,
                protein_per_100g=12.0,
                fat_per_100g=8.0,
                carbs_per_100g=22.0,
            )
            session.add(prod)
            await session.commit()
            await session.refresh(prod)
            prod_id = prod.id

            # Record scan for User 1 only
            await record_user_scan(session, u1_res.json()["user"]["id"], prod_id, prod.barcode)

        # User 1 has the item in recent shelf
        u1_recent = await client.get("/api/barcode/recent", headers=headers1)
        assert u1_recent.status_code == 200
        assert any(item["product_id"] == prod_id for item in u1_recent.json())

        # User 2 tries to delete User 1's scan
        u2_del = await client.delete(f"/api/barcode/recent/{prod_id}", headers=headers2)
        assert u2_del.status_code == 204  # 204 No Content

        # User 1 still has the item! User 2 could NOT delete User 1's recent item
        u1_recent_after = await client.get("/api/barcode/recent", headers=headers1)
        assert u1_recent_after.status_code == 200
        assert any(item["product_id"] == prod_id for item in u1_recent_after.json())

        # Now User 1 deletes their own item
        u1_del = await client.delete(f"/api/barcode/recent/{prod_id}", headers=headers1)
        assert u1_del.status_code == 204

        # Now it is removed from User 1's recent shelf
        u1_recent_final = await client.get("/api/barcode/recent", headers=headers1)
        assert not any(item["product_id"] == prod_id for item in u1_recent_final.json())


def test_rate_limiter_memory_leak_prevention():
    """Verify that cleanup_stale_rate_limit_records evicts expired user deques."""
    now = 1000.0
    _rate_limit_records.clear()

    # User 1 active at t=990 (10s ago)
    _rate_limit_records[1].append(990.0)
    # User 2 stale at t=900 (100s ago)
    _rate_limit_records[2].append(900.0)
    # User 3 empty deque
    _rate_limit_records[3].clear()

    assert len(_rate_limit_records) == 3

    cleanup_stale_rate_limit_records(now=now)

    # Only User 1 should remain, User 2 and 3 must be evicted
    assert 1 in _rate_limit_records
    assert 2 not in _rate_limit_records
    assert 3 not in _rate_limit_records
    assert len(_rate_limit_records) == 1


@pytest.mark.asyncio
async def test_barcode_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Register test user
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


@pytest.mark.asyncio
async def test_barcode_product_override_and_refresh():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        email = f"barcode_override_{int(time.time())}@example.com"
        reg_res = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Тестер Исправления"},
        )
        assert reg_res.status_code == 201
        token = reg_res.json()["token"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Seed or lookup product with custom barcode
        test_barcode = f"460999{int(time.time()) % 1000000:06d}1"

        # Create a custom product with this barcode
        from app.database import AsyncSessionLocal
        from app.models.product import Product

        async with AsyncSessionLocal() as session:
            seeded = Product(
                name="Неточный Творог",
                brand="Старый Бренд",
                barcode=test_barcode,
                calories_per_100g=120.0,
                protein_per_100g=14.0,
                fat_per_100g=5.0,
                carbs_per_100g=3.0,
                package_weight_grams=200.0,
                is_custom=False,
            )
            session.add(seeded)
            await session.commit()
            await session.refresh(seeded)
            prod_id = seeded.id

        # 1. Lookup initial product
        initial_lookup = await client.post(
            "/api/barcode/lookup",
            json={"barcode": test_barcode},
            headers=headers,
        )
        assert initial_lookup.status_code == 200
        assert initial_lookup.json()["calories_per_100g"] == 120.0

        # 2. Update/override product via PUT /api/barcode/product/{id}
        update_payload = {
            "name": "Творог 9% Правильный",
            "brand": "Проверенная Ферма",
            "calories_per_100g": 157.0,
            "protein_per_100g": 16.5,
            "fat_per_100g": 9.0,
            "carbs_per_100g": 2.0,
            "package_weight_grams": 250.0,
        }
        put_res = await client.put(
            f"/api/barcode/product/{prod_id}",
            json=update_payload,
            headers=headers,
        )
        assert put_res.status_code == 200
        updated_data = put_res.json()
        assert updated_data["name"] == "Творог 9% Правильный"
        assert updated_data["brand"] == "Проверенная Ферма"
        assert updated_data["calories_per_100g"] == 157.0
        assert updated_data["package_weight_grams"] == 250.0

        # 3. Subsequent lookup retrieves verified data
        re_lookup = await client.post(
            "/api/barcode/lookup",
            json={"barcode": test_barcode},
            headers=headers,
        )
        assert re_lookup.status_code == 200
        re_data = re_lookup.json()
        assert re_data["name"] == "Творог 9% Правильный"
        assert re_data["brand"] == "Проверенная Ферма"
        assert re_data["calories_per_100g"] == 157.0
        assert re_data["package_weight_grams"] == 250.0
        assert re_data["source"] == "local"

        # 4. Check recent shelf contains the verified product
        recent_res = await client.get("/api/barcode/recent", headers=headers)
        assert recent_res.status_code == 200
        shelf_items = recent_res.json()
        target_prod_id = updated_data.get("product_id") or updated_data.get("id") or prod_id
        matched = [item for item in shelf_items if item["product_id"] == target_prod_id]
        assert len(matched) == 1
        assert matched[0]["name"] == "Творог 9% Правильный"
        assert matched[0]["calories_per_100g"] == 157.0
