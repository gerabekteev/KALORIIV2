import time
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User


@pytest.mark.asyncio
async def test_telegram_link_code_lifecycle_and_unlinking():
    """Tests generating link codes, status inspection, linking, and unlinking."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"tg_user_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "ТГ Пользователь"},
        )
        user_id = reg.json()["user"]["id"]
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Initial status: not linked
        st1 = await client.get("/api/telegram/status", headers=headers)
        assert st1.status_code == 200
        assert st1.json()["is_linked"] is False

        # 2. Generate link-code
        lc_res = await client.post("/api/telegram/link-code", headers=headers)
        assert lc_res.status_code == 200
        data_code = lc_res.json()
        assert data_code["link_code"] is not None
        assert len(data_code["link_code"]) >= 6
        assert data_code["expires_at"] is not None

        # 3. Simulate bot linking user in DB
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            user.telegram_chat_id = 987654321
            user.telegram_username = "tg_tester"
            await session.commit()

        # 4. Status now reports linked
        st2 = await client.get("/api/telegram/status", headers=headers)
        assert st2.status_code == 200
        data_st2 = st2.json()
        assert data_st2["is_linked"] is True
        assert data_st2["telegram_chat_id"] == 987654321
        assert data_st2["telegram_username"] == "tg_tester"

        # 5. Unlink Telegram
        unlink_res = await client.delete("/api/telegram/unlink", headers=headers)
        assert unlink_res.status_code == 200
        assert unlink_res.json()["is_linked"] is False

        # Verify DB is cleared
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            assert user.telegram_chat_id is None
            assert user.telegram_username is None


@pytest.mark.asyncio
async def test_telegram_send_shopping_list_with_html_escaping():
    """Tests sending shopping list to Telegram with HTML escaping and formatting (GC-01, SEC-04)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        ts = int(time.time() * 1000)
        email = f"tg_shop_{ts}@example.com"
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "Password123!", "name": "Покупатель"},
        )
        user_id = reg.json()["user"]["id"]
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        shopping_payload = {
            "title": "Список покупок на неделю",
            "items": [
                {"name": "<script>alert('xss')</script>Огурцы", "totalGrams": 500, "category": "🥦 Овощи, фрукты и зелень", "checked": False},
                {"name": "Куриное филе <b>Extra</b>", "totalGrams": 800, "category": "🥩 Мясо, птица, рыба", "checked": False},
                {"name": "Творог 5% & Кефир", "totalGrams": 400, "category": "🥛 Молочные продукты и яйца", "checked": False},
            ],
        }

        # 1. If not linked -> 400 Bad Request
        res_unlinked = await client.post("/api/telegram/send-shopping-list", json=shopping_payload, headers=headers)
        assert res_unlinked.status_code == 400
        assert "не привязан" in res_unlinked.json()["detail"].lower()

        # 2. Link telegram chat
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            user.telegram_chat_id = 123456789
            await session.commit()

        # 3. Send shopping list with mocked telegram bot send_message
        with patch.object(settings, "TELEGRAM_BOT_TOKEN", "123456:dummy-token"), \
             patch("app.routers.telegram.telegram_bot_service.send_message", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = 1001

            res_sent = await client.post("/api/telegram/send-shopping-list", json=shopping_payload, headers=headers)
            assert res_sent.status_code == 200
            assert res_sent.json()["success"] is True

            # Verify that send_message was called and raw HTML injection tags were escaped
            assert mock_send.called
            call_kwargs = mock_send.call_args.kwargs
            sent_text = call_kwargs.get("text", "")

            # HTML characters like <script> must be escaped to &lt;script&gt;
            assert "<script>" not in sent_text
            assert "&lt;script&gt;" in sent_text
            assert "<b>Extra</b>" not in sent_text
            assert "&lt;b&gt;Extra&lt;/b&gt;" in sent_text
            assert "🥦 Овощи, фрукты и зелень" in sent_text
            assert "500г" in sent_text
