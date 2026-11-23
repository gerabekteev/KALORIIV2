import time
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import AsyncSessionLocal
from app.models.product import Product
from sqlalchemy import select, and_


@pytest.mark.asyncio
async def test_honest_sign_datamatrix_and_standard_barcode_scanning():
    """Tests scanning standard EAN-13 and Honest Sign (Честный Знак) DataMatrix codes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"barcode_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Сканер Тест"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a seed-like product in database (13-digit EAN-13)
        barcode_clean = f"4607000{ts % 1000000:06d}"
        async with AsyncSessionLocal() as session:
            p = Product(
                name="Йогурт с черникой Честный Знак",
                barcode=barcode_clean,
                calories_per_100g=75.0,
                protein_per_100g=3.5,
                fat_per_100g=2.5,
                carbs_per_100g=11.0,
                package_weight_grams=150.0,
                brand="ВкусВилл",
                is_custom=False,
                created_by_user_id=None,  # system product
            )
            session.add(p)
            await session.commit()
            await session.refresh(p)
            prod_id = p.id

        # 2. Scan standard barcode
        res_std = await client.post("/api/barcode/lookup", json={"barcode": barcode_clean}, headers=headers)
        assert res_std.status_code == 200
        data_std = res_std.json()
        assert data_std["name"] == "Йогурт с черникой Честный Знак"
        assert data_std["barcode"] == barcode_clean
        assert data_std.get("is_honest_sign") is False or data_std.get("is_honest_sign") is None

        # 3. Scan Honest Sign DataMatrix code containing (01) GTIN + serial/crypto tail
        honest_sign_raw = f"010{barcode_clean}215xY9!Z93d4eF"
        res_hs = await client.post("/api/barcode/lookup", json={"barcode": honest_sign_raw}, headers=headers)
        assert res_hs.status_code == 200
        data_hs = res_hs.json()
        assert data_hs["name"] == "Йогурт с черникой Честный Знак"
        assert data_hs["barcode"] == barcode_clean
        assert data_hs.get("is_honest_sign") is True


@pytest.mark.asyncio
async def test_idor_protection_and_product_forking():
    """Tests that modifying a system product forks a user-specific copy, protecting other users."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        u1_email = f"user_fork1_{ts}@example.com"
        u2_email = f"user_fork2_{ts}@example.com"

        r1 = await client.post("/api/auth/register", json={"email": u1_email, "password": "Password123!", "name": "User 1"})
        h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}

        r2 = await client.post("/api/auth/register", json={"email": u2_email, "password": "Password123!", "name": "User 2"})
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

        # Create a system seed product
        shared_barcode = f"460888{ts % 1000000:06d}"
        async with AsyncSessionLocal() as session:
            sys_prod = Product(
                name="Глобальное Молоко 3.2%",
                barcode=shared_barcode,
                calories_per_100g=60.0,
                protein_per_100g=3.0,
                fat_per_100g=3.2,
                carbs_per_100g=4.7,
                is_custom=False,
                created_by_user_id=None,
            )
            session.add(sys_prod)
            await session.commit()
            await session.refresh(sys_prod)
            sys_id = sys_prod.id

        # User 1 overrides the product (e.g. adjusts calories/protein)
        override_payload = {
            "name": "Молоко 3.2% (Уточнённое Пользователем 1)",
            "calories_per_100g": 62.0,
            "protein_per_100g": 3.2,
            "fat_per_100g": 3.2,
            "carbs_per_100g": 4.5,
        }
        res_override = await client.put(f"/api/barcode/product/{sys_id}", json=override_payload, headers=h1)
        assert res_override.status_code == 200
        u1_prod = res_override.json()

        # Check that a fork was created with user_id set and a NEW id (or user_id = u1)
        assert u1_prod["name"] == "Молоко 3.2% (Уточнённое Пользователем 1)"
        assert u1_prod["calories_per_100g"] == 62.0

        # Verify that User 2 scanning the barcode STILL sees the original global product untouched!
        res_u2_scan = await client.post("/api/barcode/lookup", json={"barcode": shared_barcode}, headers=h2)
        assert res_u2_scan.status_code == 200
        u2_prod = res_u2_scan.json()
        assert u2_prod["name"] == "Глобальное Молоко 3.2%"
        assert u2_prod["calories_per_100g"] == 60.0

        # Verify system product in database is unmodified
        async with AsyncSessionLocal() as session:
            db_sys = await session.get(Product, sys_id)
            assert db_sys.name == "Глобальное Молоко 3.2%"
            assert db_sys.created_by_user_id is None


@pytest.mark.asyncio
async def test_recent_scans_shelf_isolation_and_lru():
    """Tests that the recent scanned products shelf is isolated per user and orders by time."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        u1_email = f"recent_u1_{ts}@example.com"
        u2_email = f"recent_u2_{ts}@example.com"

        r1 = await client.post("/api/auth/register", json={"email": u1_email, "password": "Password123!", "name": "Shelf User 1"})
        h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}

        r2 = await client.post("/api/auth/register", json={"email": u2_email, "password": "Password123!", "name": "Shelf User 2"})
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

        # Create two products
        b1 = f"460111{ts % 1000000:06d}"
        b2 = f"460222{ts % 1000000:06d}"
        async with AsyncSessionLocal() as session:
            session.add_all([
                Product(name="Товар 1 для Полки", barcode=b1, calories_per_100g=100.0, protein_per_100g=10.0, fat_per_100g=5.0, carbs_per_100g=10.0, is_custom=False, created_by_user_id=None),
                Product(name="Товар 2 для Полки", barcode=b2, calories_per_100g=200.0, protein_per_100g=20.0, fat_per_100g=10.0, carbs_per_100g=20.0, is_custom=False, created_by_user_id=None),
            ])
            await session.commit()

        # User 1 scans Product 1 and Product 2
        await client.post("/api/barcode/lookup", json={"barcode": b1}, headers=h1)
        await client.post("/api/barcode/lookup", json={"barcode": b2}, headers=h1)

        # User 1's shelf should contain 2 items, with Product 2 first
        shelf1 = await client.get("/api/barcode/recent", headers=h1)
        assert shelf1.status_code == 200
        items1 = shelf1.json()
        assert len(items1) >= 2
        barcodes_u1 = [i["barcode"] for i in items1]
        assert b2 in barcodes_u1 and b1 in barcodes_u1

        # User 2 has NOT scanned anything yet; shelf should not show User 1's items
        shelf2 = await client.get("/api/barcode/recent", headers=h2)
        assert shelf2.status_code == 200
        items2 = shelf2.json()
        barcodes_u2 = [i["barcode"] for i in items2]
        assert b1 not in barcodes_u2
        assert b2 not in barcodes_u2


@pytest.mark.asyncio
async def test_custom_product_image_url_validation():
    """Tests SEC-10: custom product image_url scheme validation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"prod_val_{ts}@example.com"
        reg = await client.post("/api/auth/register", json={"email": email, "password": "Password123!", "name": "Прод Валидатор"})
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # 1. Valid HTTPS image URL
        res_ok = await client.post(
            "/api/products",
            json={
                "name": "Продукт с валидной картинкой",
                "calories_per_100g": 120.0,
                "protein_per_100g": 10.0,
                "fat_per_100g": 5.0,
                "carbs_per_100g": 10.0,
                "image_url": "https://example.com/photos/healthy-snack.jpg",
                "brand": "Organic Farm",
                "package_weight_grams": 250.0,
            },
            headers=headers,
        )
        assert res_ok.status_code == 201
        created = res_ok.json()
        assert created["image_url"] == "https://example.com/photos/healthy-snack.jpg"
        assert created["brand"] == "Organic Farm"
        assert created["package_weight_grams"] == 250.0

        # 2. Invalid image URL scheme (javascript: or file://) -> 422
        res_bad = await client.post(
            "/api/products",
            json={
                "name": "Продукт с вредоносной ссылкой",
                "calories_per_100g": 100.0,
                "protein_per_100g": 10.0,
                "fat_per_100g": 5.0,
                "carbs_per_100g": 10.0,
                "image_url": "javascript:alert(1)",
            },
            headers=headers,
        )
        assert res_bad.status_code == 422


@pytest.mark.asyncio
async def test_ai_ocr_shared_local_barcode_cache_and_forking():
    """Tests shared local cache for AI OCR scanned labels with barcodes, IDOR forking, and deduplicated search."""
    import io
    from pathlib import Path
    from unittest.mock import AsyncMock, patch
    from PIL import Image
    from app.config import settings
    from app.schemas.ai import FoodAnalysisResult

    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (240, 240, 240)).save(buf, format="JPEG")
    jpeg_bytes = buf.getvalue()

    uploaded_to_cleanup = []
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            ts = int(time.time() * 1000)
            r1 = await client.post(
                "/api/auth/register",
                json={"email": f"ocr_u1_{ts}@example.com", "password": "Password123!", "name": "OCR User 1"},
            )
            h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}

            r2 = await client.post(
                "/api/auth/register",
                json={"email": f"ocr_u2_{ts}@example.com", "password": "Password123!", "name": "OCR User 2"},
            )
            h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

            shared_barcode = f"460777{ts % 1000000:06d}1"
            unique_name = f"Сырок ВкусВилл OCR {ts}"
            mock_result = FoodAnalysisResult(
                name=unique_name,
                brand="ВкусВилл",
                barcode=None,  # barcode is passed via Form field, not visible on nutrition table photo
                weight_grams=45.0,
                calories=385.0,
                protein=8.5,
                fat=24.0,
                carbs=33.5,
                confidence="high",
            )

            with patch(
                "app.routers.barcode.ai_router.recognize_food",
                new=AsyncMock(return_value=(mock_result, "gemini", "gemini-test")),
            ):
                scan_res = await client.post(
                    "/api/barcode/scan-image",
                    files={"photo": ("label.jpg", jpeg_bytes, "image/jpeg")},
                    data={"barcode": shared_barcode},
                    headers=h1,
                )

            assert scan_res.status_code == 200, scan_res.text
            scan_data = scan_res.json()
            assert scan_data["detected_code"] == shared_barcode
            ocr_prod = scan_data["product"]
            assert ocr_prod["name"] == unique_name
            assert ocr_prod["calories_per_100g"] == 385.0
            if ocr_prod.get("image_url"):
                uploaded_to_cleanup.append(ocr_prod["image_url"])

            # Verify product is stored in the shared global cache (is_custom=False, created_by_user_id=None)
            async with AsyncSessionLocal() as session:
                db_prod = await session.get(Product, ocr_prod["product_id"])
                assert db_prod is not None
                assert db_prod.is_custom is False
                assert db_prod.created_by_user_id is None
                assert db_prod.barcode == shared_barcode

            # User 2 scans the same barcode -> instant hit from shared local cache!
            u2_lookup = await client.post(
                "/api/barcode/lookup",
                json={"barcode": shared_barcode},
                headers=h2,
            )
            assert u2_lookup.status_code == 200
            u2_data = u2_lookup.json()
            assert u2_data["source"] == "local"
            assert u2_data["name"] == unique_name
            assert u2_data["calories_per_100g"] == 385.0
            assert u2_data["image_url"] == ocr_prod["image_url"]

            # User 2 edits the product -> forks personal copy without modifying shared global cache
            u2_fork = await client.put(
                f"/api/barcode/product/{u2_data['product_id']}",
                json={
                    "name": f"{unique_name} (правки U2)",
                    "brand": "ВкусВилл",
                    "calories_per_100g": 399.0,
                    "protein_per_100g": 9.0,
                    "fat_per_100g": 25.0,
                    "carbs_per_100g": 34.0,
                    "package_weight_grams": 45.0,
                },
                headers=h2,
            )
            assert u2_fork.status_code == 200
            assert u2_fork.json()["calories_per_100g"] == 399.0

            # User 1 still gets the untouched shared OCR entry
            u1_lookup = await client.post(
                "/api/barcode/lookup",
                json={"barcode": shared_barcode},
                headers=h1,
            )
            assert u1_lookup.status_code == 200
            assert u1_lookup.json()["calories_per_100g"] == 385.0

            # User 2's GET /api/products search should NOT return duplicate rows for the forked barcode
            u2_search = await client.get(
                "/api/products",
                params={"search": unique_name},
                headers=h2,
            )
            assert u2_search.status_code == 200
            matched_barcodes = [p for p in u2_search.json() if p.get("barcode") == shared_barcode]
            assert len(matched_barcodes) == 1
            assert matched_barcodes[0]["calories_per_100g"] == 399.0
    finally:
        for rel_url in uploaded_to_cleanup:
            fname = Path(rel_url).name
            fp = settings.UPLOAD_DIR / fname
            if fp.exists():
                try:
                    fp.unlink()
                except Exception:
                    pass


@pytest.mark.asyncio
async def test_ai_ocr_without_barcode_stays_private_and_share_to_catalog():
    """Tests that barcode-less OCR stays private, while share_to_catalog=True populates shared cache."""
    import io
    from pathlib import Path
    from unittest.mock import AsyncMock, patch
    from PIL import Image
    from app.config import settings
    from app.schemas.ai import FoodAnalysisResult

    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 220, 240)).save(buf, format="JPEG")
    jpeg_bytes = buf.getvalue()

    uploaded_to_cleanup = []
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            ts = int(time.time() * 1000)
            r1 = await client.post(
                "/api/auth/register",
                json={"email": f"ocr_priv1_{ts}@example.com", "password": "Password123!", "name": "Priv User 1"},
            )
            h1 = {"Authorization": f"Bearer {r1.json()['access_token']}"}
            u1_id = r1.json()["user"]["id"]

            r2 = await client.post(
                "/api/auth/register",
                json={"email": f"ocr_priv2_{ts}@example.com", "password": "Password123!", "name": "Priv User 2"},
            )
            h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}

            # 1. OCR without any barcode stays private to User 1
            priv_name = f"Домашний Пирог Без Кода {ts % 100000}"
            mock_no_code = FoodAnalysisResult(
                name=priv_name,
                brand=None,
                barcode=None,
                weight_grams=100.0,
                calories=260.0,
                protein=6.0,
                fat=10.0,
                carbs=36.0,
                confidence="medium",
            )
            with patch(
                "app.routers.barcode.ai_router.recognize_food",
                new=AsyncMock(return_value=(mock_no_code, "gemini", "gemini-test")),
            ):
                res_priv = await client.post(
                    "/api/barcode/scan-image",
                    files={"photo": ("pie.jpg", jpeg_bytes, "image/jpeg")},
                    headers=h1,
                )
            assert res_priv.status_code == 200
            priv_prod = res_priv.json()["product"]
            if priv_prod.get("image_url"):
                uploaded_to_cleanup.append(priv_prod["image_url"])

            async with AsyncSessionLocal() as session:
                db_priv = await session.get(Product, priv_prod["product_id"])
                assert db_priv.is_custom is True
                assert db_priv.created_by_user_id == u1_id

            u2_search = await client.get("/api/products", params={"search": priv_name}, headers=h2)
            assert u2_search.status_code == 200
            assert all(p["name"] != priv_name for p in u2_search.json())

            # 2. Confirming OCR product with barcode + share_to_catalog=True seeds shared global cache
            shared_code = f"460555{ts % 1000000:06d}9"
            shared_name = f"Творог Савушкин OCR {ts}"
            create_shared = await client.post(
                "/api/products",
                json={
                    "name": shared_name,
                    "brand": "Савушкин",
                    "barcode": shared_code,
                    "calories_per_100g": 121.0,
                    "protein_per_100g": 17.2,
                    "fat_per_100g": 5.0,
                    "carbs_per_100g": 1.8,
                    "package_weight_grams": 180.0,
                    "share_to_catalog": True,
                },
                headers=h1,
            )
            assert create_shared.status_code == 201
            created_data = create_shared.json()
            assert created_data["is_custom"] is False
            assert created_data["created_by_user_id"] is None

            # User 2 finds it immediately via barcode lookup
            u2_hit = await client.post(
                "/api/barcode/lookup",
                json={"barcode": shared_code},
                headers=h2,
            )
            assert u2_hit.status_code == 200
            assert u2_hit.json()["source"] == "local"
            assert u2_hit.json()["name"] == shared_name
            assert u2_hit.json()["calories_per_100g"] == 121.0
    finally:
        for rel_url in uploaded_to_cleanup:
            fname = Path(rel_url).name
            fp = settings.UPLOAD_DIR / fname
            if fp.exists():
                try:
                    fp.unlink()
                except Exception:
                    pass
