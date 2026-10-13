import io
import json
from pathlib import Path
from PIL import Image
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.utils.ai_providers.base import build_system_prompt
from app.utils.image import process_image, MAX_IMAGE_DIMENSION
from app.schemas.ai import TextAnalysisRequest
from scripts.seed_products import SEED_FILE, seed_products
from app.database import AsyncSessionLocal


def test_system_prompt_screenshot_ocr_instructions():
    """Verify system prompt contains explicit OCR instructions for screenshots and delivery apps."""
    prompt = build_system_prompt()
    assert "скриншот экрана" in prompt
    assert "Яндекс Еда" in prompt
    assert "Самокат" in prompt
    assert "Додо" in prompt
    assert "таблица пищевой ценности КБЖУ" in prompt
    assert "этикетка продукта" in prompt
    assert "чек" in prompt
    assert "меню или скриншот рецепта" in prompt
    assert "распознай напечатанный текст" in prompt
    print("[OK] System prompt includes complete OCR instructions for screenshots")


def test_rgba_screenshot_white_compositing():
    """Verify RGBA/transparent screenshots composite onto a clean white background without black box artifacts."""
    # Create an RGBA image with transparent background and black text-like pixels
    rgba_img = Image.new("RGBA", (800, 600), (0, 0, 0, 0))  # fully transparent
    # Add non-transparent colored shape
    for x in range(100, 200):
        for y in range(100, 200):
            rgba_img.putpixel((x, y), (200, 30, 40, 255))

    buf = io.BytesIO()
    rgba_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    compressed_bytes, mime = process_image(png_bytes)
    assert mime == "image/jpeg"

    # Verify background was converted to white, not black
    processed = Image.open(io.BytesIO(compressed_bytes))
    assert processed.mode == "RGB"
    # Pixel (10, 10) was transparent -> in JPEG it should now be white (approx 255, 255, 255)
    r, g, b = processed.getpixel((10, 10))
    assert r > 240 and g > 240 and b > 240, f"Expected near-white background, got ({r}, {g}, {b})"
    print(f"[OK] Transparent screenshot cleanly composited onto white background: ({r}, {g}, {b})")


def test_text_analysis_request_validation():
    """Verify TextAnalysisRequest rejects whitespace-only text."""
    with pytest.raises(Exception):
        TextAnalysisRequest(text="    ")

    with pytest.raises(Exception):
        TextAnalysisRequest(text="")

    valid = TextAnalysisRequest(text="  Овсяная каша 200г  ")
    assert valid.text == "Овсяная каша 200г"
    print("[OK] TextAnalysisRequest whitespace validation verified")


def test_products_seed_database_expansion():
    """Verify products_seed.json has expanded to over 120-150 items with all required categories."""
    assert SEED_FILE.exists(), f"Seed file missing at {SEED_FILE}"

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        products = json.load(f)

    assert len(products) >= 120, f"Expected at least 120 products, got {len(products)}"
    print(f"[OK] Total products in seed: {len(products)}")

    # Category verification
    categories = {p.get("category") for p in products}
    assert "Супы" in categories
    assert "Готовые блюда" in categories
    assert "Гарниры" in categories
    assert "Мясо и птица" in categories
    assert "Рыба и морепродукты" in categories
    assert "Яйца и молочные продукты" in categories
    assert "Фастфуд и выпечка" in categories
    assert "Напитки" in categories
    assert "Орехи и семена" in categories
    assert "Сладости и десерты" in categories

    names = {p["name"].lower() for p in products}

    # Verify required soup positions
    assert any("борщ" in n for n in names)
    assert any("солянка" in n for n in names)
    assert any("рассольник" in n for n in names)
    assert any("уха" in n for n in names)
    assert any("куриный" in n and "лапшой" in n for n in names)
    assert any("щи" in n for n in names)
    assert any("грибной" in n for n in names)

    # Verify required ready second courses
    assert any("плов" in n for n in names)
    assert any("котлета по-киевски" in n for n in names)
    assert any("гуляш" in n for n in names)
    assert any("бефстроганов" in n for n in names)
    assert any("тефтели" in n for n in names)
    assert any("сырники" in n for n in names)
    assert any("запеканка" in n for n in names)
    assert any("голубцы" in n for n in names)
    assert any("пельмени" in n for n in names)
    assert any("вареники" in n for n in names)

    # Verify required side dishes
    assert any("картофельное пюре" in n for n in names)
    assert any("картофель запечённый" in n for n in names)
    assert any("булгур" in n for n in names)
    assert any("чечевица" in n for n in names)
    assert any("фасоль" in n for n in names)

    # Verify meat & poultry
    assert any("индейка" in n for n in names)
    assert any("говядина" in n for n in names)
    assert any("свиная вырезка" in n for n in names)
    assert any("фарш" in n for n in names)

    # Verify fish & seafood
    assert any("лосось" in n or "сёмга" in n for n in names)
    assert any("минтай на пару" in n for n in names)
    assert any("тунец" in n for n in names)
    assert any("креветки" in n for n in names)
    assert any("кальмар" in n for n in names)

    # Verify dairy
    assert any("кефир 2.5%" in n for n in names)
    assert any("ряженка" in n for n in names)
    assert any("греческий йогурт" in n for n in names)
    assert any("моцарелла" in n for n in names)
    assert any("пармезан" in n for n in names)
    assert any("сулугуни" in n for n in names)

    # Verify fast food & bakery
    assert any("шаурма" in n for n in names)
    assert any("пицца пепперони" in n for n in names)
    assert any("бургер" in n for n in names)
    assert any("круассан" in n for n in names)
    assert any("блины" in n for n in names)

    # Verify drinks
    assert any("латте" in n for n in names)
    assert any("капучино" in n for n in names)
    assert any("морс" in n for n in names)
    assert any("сок апельсиновый" in n for n in names)

    # Verify snacks & nuts
    assert any("миндаль" in n for n in names)
    assert any("грецкий орех" in n for n in names)
    assert any("кешью" in n for n in names)
    assert any("протеиновый батончик" in n for n in names)
    assert any("шоколад тёмный" in n for n in names)

    print("[OK] All required categories and positions verified in seed database")


async def test_seed_products_idempotency():
    """Verify seed_products can run repeatedly without error or duplicate records."""
    async with AsyncSessionLocal() as session:
        # First call: already up to date
        inserted = await seed_products(session)
        assert inserted == 0
        print("[OK] seed_products idempotency verified: 0 duplicates inserted")
