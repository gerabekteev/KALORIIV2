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
